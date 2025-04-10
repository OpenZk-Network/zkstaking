// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;


import "../vendors/zksync/bridgehub/IBridgehub.sol";

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ILiquidityManager} from "../interfaces/ILiquidityManager.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract BridgeTokenMiddleware is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // EVENTS
    event ShareMinted(address indexed sender, uint256 amount, uint256 shares);
    event CanonicalTxHash(bytes32 indexed canonicalTxHash);
    event BridgeToken(address token, uint256 amount, uint256 l2GasLimit, uint256 l2GasPerPubdataByteLimit, uint256 gasMinted);
    event TokenSupported(address indexed token, bool allowed);
    event Swept(address indexed token, address indexed to);

    // VARIABLES
    bytes32 public constant WITHDRAW_ROLE = keccak256("WITHDRAW_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    address public immutable native;
    uint256 public immutable chainId;

    /// @notice address of the bridgeHub
    IBridgehub public immutable bridgeHub;

    ILiquidityManager public immutable liquidityManager;
    mapping (address => bool) public supportedTokens;

    constructor (
        address _nativeCoin,
        uint256 _chainId,
        address _bridgeHub,
        address _admin,
        address _withdrawer,
        address _liquidityManager
    ) {
        require(_nativeCoin != address(0), "BridgeWrap: native coin address is zero");
        require(_bridgeHub != address(0), "BridgeWrap: bridgeHub address is zero");
        require(_admin != address(0), "BridgeWrap: admin address is zero");
        require(_withdrawer != address(0), "BridgeWrap: withdrawer address is zero");
        require(_liquidityManager != address(0), "BridgeWrap: liquidity manager address is zero");

        native = _nativeCoin;
        chainId = _chainId;
        bridgeHub = IBridgehub(_bridgeHub);
        liquidityManager = ILiquidityManager(_liquidityManager);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(WITHDRAW_ROLE, _withdrawer);
        _grantRole(WITHDRAW_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
    }

    function bridgeToken(address token, uint256 amount, uint256 _l2GasLimit) external payable nonReentrant {
        require(supportedTokens[token], "BridgeWrap: token not supported");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // mint gas for layer2 payment
        uint256 gasCost = l2TransactionBaseCost(tx.gasprice, _l2GasLimit, 800);
        uint256 neededEth = _convertToEthAmount(gasCost);
        require (msg.value >= neededEth, "BridgeWrap: not enough ETH to cover the gas cost");
        uint256 gasMinted = _stakeNative(neededEth);

        // bridge to L2
        _bridgeErc20(msg.sender, token, amount, _l2GasLimit, 800, gasMinted);
        emit BridgeToken(token, amount, _l2GasLimit, 800, gasMinted);

        // refund the remaining ETH to the user
        (bool success, ) = payable(msg.sender).call{value: msg.value - neededEth}("");
        require(success, "BridgeWrap: refund failed");
    }

    function supportTokens(address[] calldata tokens, bool[] calldata allows) external onlyRole(OPERATOR_ROLE) {
        require(tokens.length != allows.length, "supportTokens: invalid tokens length");
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "supportTokens: token cannot be zero address");
            supportedTokens[tokens[i]] = allows[i];
            emit TokenSupported(tokens[i], allows[i]);
        }
    }

    function sweepTokens(address token, address to) external onlyRole(WITHDRAW_ROLE) {
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
        emit Swept(token, to);
    }

    function recoverEth() external onlyRole(WITHDRAW_ROLE) {
        payable(msg.sender).transfer(address(this).balance);
        emit Swept(address(0), msg.sender);
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
        return bridgeHub.l2TransactionBaseCost(chainId, _l1GasPrice, _l2GasLimit, _l2GasPerPubdataByteLimit);
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

    /// Bridge ERC20 from L1 (Ethereum) to L2 (hyperchain)
    function _bridgeErc20(
        address _l2Receiver,
        address _token,
        uint256 _amount,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        uint256 _l2GasMinted
    ) internal returns (bytes32 canonicalTxHash) {

        address sharedBridge = address(bridgeHub.sharedBridge());
        IERC20(_token).approve(sharedBridge, _amount);
        IERC20(native).safeIncreaseAllowance(sharedBridge, _l2GasMinted);

        bytes memory callData = _getDepositL2Calldata(_l2Receiver, _token, _amount);

        canonicalTxHash = bridgeHub.requestL2TransactionTwoBridges(
            L2TransactionRequestTwoBridgesOuter({
                chainId: chainId,
                mintValue: _l2GasMinted,
                l2Value: 0,
                l2GasLimit: _l2GasLimit,
                l2GasPerPubdataByteLimit: _l2GasPerPubdataByteLimit,
                refundRecipient: _l2Receiver,
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

    function _stakeNative(uint256 amount) internal returns (uint256 sharesMinted){
        sharesMinted = IERC20(native).balanceOf(address(this));
        // send ETH to liquidity manager to get shares (ozETH)
        liquidityManager.stake{value: amount}();
        sharesMinted = IERC20(native).balanceOf(address(this)) - sharesMinted;
        emit ShareMinted(msg.sender, amount, sharesMinted);
    }
}
