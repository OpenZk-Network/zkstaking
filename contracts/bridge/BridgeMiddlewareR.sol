// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;


import "../vendors/zksync/bridgehub/IBridgehub.sol";

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ILiquidityManager} from "../interfaces/ILiquidityManager.sol";
import {IUSDVault} from "../interfaces/IUSDVault.sol";


contract BridgeMiddlewareR is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ERRORS


    // EVENTS
    event ShareMinted(address indexed sender, uint256 amount, uint256 shares);
    event CanonicalTxHash(bytes32 indexed canonicalTxHash);
    event Swept(address indexed token, address indexed to);
    event StakeAndBridge(address token, uint256 amount, uint256 ozUSDMinted, uint256 l2GasLimit, uint256 l2GasPerPubdataByteLimit, uint256 gasMinted);
    // VARIABLES

    bytes32 public constant WITHDRAW_ROLE = keccak256("WITHDRAW_ROLE");

    address public immutable native;
    uint256 public immutable chainId;

    /// @notice address of the bridgehub
    IBridgehub public immutable bridgehub;

    ILiquidityManager public immutable liquidityManager;
    IUSDVault public immutable ozUSDVault;


    constructor (
        address _nativeCoin,
        uint256 _chainId,
        address _bridgehub,
        address _admin,
        address _withdrawer,
        address _liquidityManager,
        address _ozUSDVault
    ) {
        require(_nativeCoin != address(0), "BridgeWrap: native coin address is zero");
        require(_bridgehub != address(0), "BridgeWrap: bridgehub address is zero");
        require(_admin != address(0), "BridgeWrap: admin address is zero");
        require(_withdrawer != address(0), "BridgeWrap: withdrawer address is zero");
        native = _nativeCoin;
        chainId = _chainId;
        bridgehub = IBridgehub(_bridgehub);
        liquidityManager = ILiquidityManager(_liquidityManager);
        ozUSDVault = IUSDVault(_ozUSDVault);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(WITHDRAW_ROLE, _withdrawer);
    }



    function stakeAndBridgeStable(address token, uint256 amount, uint256 _l2GasLimit, address l2Receiver) external payable nonReentrant {
        uint256 gasCost = l2TransactionBaseCost(tx.gasprice, _l2GasLimit, 800);
        uint256 neededEth = _convertToEthAmount(gasCost);
        require (msg.value >= neededEth, "BridgeWrap: not enough ETH to cover the gas cost");
        uint256 gasMinted = _stakeNative(neededEth);
        uint256 ozUSDMinted;
        if (token == ozUSDVault.asset()) {
            ozUSDMinted = _stakeDai(amount);
        } else {
            ozUSDMinted = _stakeStable(token, amount);
        }
        _bridgeErc20(l2Receiver, address(ozUSDVault), ozUSDMinted, _l2GasLimit, 800, gasMinted, _msgSender());
        emit StakeAndBridge(token, amount, ozUSDMinted, _l2GasLimit, 800, gasMinted);
        (bool success, ) = payable(msg.sender).call{value: msg.value - neededEth}("");
        require(success, "BridgeWrap: refund failed");
    }

    function sweepTokens(address token, address to) external onlyRole(WITHDRAW_ROLE) {
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
        emit Swept(token, to);
    }

    /// @notice estimate the cost of L2 tx in base token.
    /// @param _l1GasPrice The gas price on L1
    /// @param _l2GasLimit The estimated L2 gas limit
    /// @param _l2GasPerPubdataByteLimit The price for each pubdata byte in L2 gas
    /// @return The price of L2 gas in the base token
    function l2TransactionBaseCost(uint256 _l1GasPrice, uint256 _l2GasLimit, uint256 _l2GasPerPubdataByteLimit)
    public
    view
    returns (uint256)
    {
        return bridgehub.l2TransactionBaseCost(chainId, _l1GasPrice, _l2GasLimit, _l2GasPerPubdataByteLimit);
    }

    /// @notice estimate the cost of L2 tx in ETH.
    /// @param _l1GasPrice The gas price on L1
    /// @param _l2GasLimit The estimated L2 gas limit
    /// @param _l2GasPerPubdataByteLimit The price for each pubdata byte in L2 gas
    /// @return The price of L2 gas in the base token
    function l2TransactionEthCost(uint256 _l1GasPrice, uint256 _l2GasLimit, uint256 _l2GasPerPubdataByteLimit)
    external
    returns (uint256)
    {
        uint256 baseCost = l2TransactionBaseCost(_l1GasPrice, _l2GasLimit, _l2GasPerPubdataByteLimit);
        return _convertToEthAmount(baseCost);
    }

    function _convertToEthAmount(uint256 _baseTokenAmount) internal returns (uint256) {
        uint256 nativeCoinAmount = IERC20(native).totalSupply();
        uint256 lmValue = liquidityManager.virtualBalance();
        if (lmValue == 0) {
            return _baseTokenAmount;
        }
        return _baseTokenAmount * lmValue * 1_000_000 / (nativeCoinAmount * 950_000); // cover for swap slippage
    }

    function _bridgeNative (
        address _l2Receiver,
        uint256 _amount,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) internal returns (bytes32 canonicalTxHash) {
        uint256 txCost = l2TransactionBaseCost(tx.gasprice, _l2GasLimit, _l2GasPerPubdataByteLimit);
        require(_amount > txCost, "BridgeWrap: not enough to cover the tx cost");
        bytes memory empty;
        IERC20(native).safeIncreaseAllowance(address(bridgehub.sharedBridge()), _amount);
        canonicalTxHash = bridgehub.requestL2TransactionDirect(
            L2TransactionRequestDirect({
                chainId: chainId,
                mintValue: _amount,
                l2Contract: _l2Receiver,
                l2Value: _amount - txCost,
                l2Calldata: empty,
                l2GasLimit: _l2GasLimit,
                l2GasPerPubdataByteLimit: _l2GasPerPubdataByteLimit,
                factoryDeps: new bytes[](0),
                refundRecipient: _l2Receiver // refund to the receiver
            })
        );
        emit CanonicalTxHash(canonicalTxHash);
    }

    /// Bridge ERC20 from L1 (Ethereum) to L2 (hyperchain)
    function _bridgeErc20(
        address _l2Receiver,
        address _token,
        uint256 _amount,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        uint256 _l2GasMinted,
        address _l2RefundAddress
    ) internal returns (bytes32 canonicalTxHash) {

        address sharedBridge = address(bridgehub.sharedBridge());
        IERC20(_token).approve(sharedBridge, _amount);
        IERC20(native).safeIncreaseAllowance(sharedBridge, _l2GasMinted);

        bytes memory callData = _getDepositL2Calldata(_l2Receiver, _token, _amount);

        canonicalTxHash = bridgehub.requestL2TransactionTwoBridges(
            L2TransactionRequestTwoBridgesOuter({
                chainId: chainId,
                mintValue: _l2GasMinted,
                l2Value: 0,
                l2GasLimit: _l2GasLimit,
                l2GasPerPubdataByteLimit: _l2GasPerPubdataByteLimit,
                refundRecipient: _l2RefundAddress,
                secondBridgeAddress: sharedBridge,
                secondBridgeValue: 0,
                secondBridgeCalldata: callData
            })
        );
        emit CanonicalTxHash(canonicalTxHash);
    }

    /// @notice Generate a calldata for calling the deposit finalization on the L2 bridge contract
    function _getDepositL2Calldata(address _l2Receiver, address _l1Token, uint256 _amount)
    internal
    pure
    returns (bytes memory)
    {
        return abi.encode(_l1Token, _amount, _l2Receiver);
    }

    function _stakeNative (uint256 amount) internal returns (uint256 sharesMinted){
        sharesMinted = IERC20(native).balanceOf(address(this));
        // send ETH to liquidity manager to get shares (ozETH)
        liquidityManager.stake{value: amount}();
        sharesMinted = IERC20(native).balanceOf(address(this)) - sharesMinted;
        emit ShareMinted(msg.sender, amount, sharesMinted);
    }

    function _stakeDai (uint256 amount) internal returns (uint256) {
        // get DAI from user
        IERC20(ozUSDVault.asset()).safeTransferFrom(msg.sender, address(this), amount);
        // give allowance to the vault, this deposit is available only for DAI
        IERC20(ozUSDVault.asset()).safeIncreaseAllowance(address(ozUSDVault), amount);
        return ozUSDVault.deposit(amount, address(this));
    }

    function _stakeStable(address token, uint256 amount) internal returns (uint256) {
        // get token from user
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        // give allowance to the vault for the token stable that vault supports, otherwise fails
        IERC20(token).safeIncreaseAllowance(address(ozUSDVault), amount);
        return ozUSDVault.depositToken(token, amount, address(this));

    }

}
