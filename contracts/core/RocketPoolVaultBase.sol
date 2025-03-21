// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IOracle} from "../IOracle.sol";
import {IERC4626Partial} from "../IERC4626Partial.sol";
import {BaseVault} from "../core/BaseVault.sol";
import {IRocketPoolRouter} from "../vendors/RocketPool/IRocketPoolRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {IDelegationManager} from "../vendors/EigenLayer/IDelegationManager.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Swap} from "./Swap.sol";

interface wETH9 {
    function deposit() external payable;

    function withdraw(uint256 wad) external;

    function balanceOf(address add) external returns (uint256);
}

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
abstract contract RocketPoolVaultBase is Initializable, BaseVault, ReentrancyGuardUpgradeable  {
    using SafeERC20 for IERC20;
    address public constant _router = 0x16D5A408e807db8eF7c578279BEeEe6b228f1c1C; // https://etherscan.io/address/0x16d5a408e807db8ef7c578279beeee6b228f1c1c#writeContract & https://github.com/rocket-pool/rocketpool-router/blob/master/src/RocketPoolRouter.ts#L25
    address public immutable _uniV3Router;
    uint256 public uniswapPortion;
    uint256 public balancerPortion;

    uint256[50] private __gap;

    constructor(
        address lm,
        address uniV3Router,
        address _oracleAddress,
        address _underlyingAddress
    ) BaseVault(lm, _oracleAddress, _underlyingAddress) {
        require(uniV3Router != address(0), "rvb: uniV3Router 0");
        _uniV3Router = uniV3Router;
        _disableInitializers();
    }

    function __RocketPoolVaultBase_init(uint24 _fee, string memory _name, string memory _symbol, address _admin, address _upgrader) internal onlyInitializing {
        __BaseVault_init(_fee, _name, _symbol, _admin, _upgrader);
        __ReentrancyGuard_init();
        _setWeight(10, 90);
    }

    /*
     * @notice Deposit assets into the vault
     * @param assets The amount of assets to deposit
     * @param receiver The address to receive the shares
     * @return shares The amount of shares minted
     */
    function deposit(
        uint256 assets,
        address receiver
    ) external payable virtual nonReentrant onlyLM returns (uint256 total) {
        require(msg.value > 0 || assets > 0, "deposit: Invalid deposit amount");

        // rETH bought
        total = _deposit(assets, receiver);

        emit Deposit(msg.sender, receiver, total);
    }

    function _setWeight(
        uint256 _uniswapPortion,
        uint256 _balancerPortion
    ) internal {
        require(
            _uniswapPortion + _balancerPortion == 100,
            "setWeight: Invalid weight"
        );

        uniswapPortion = _uniswapPortion;
        balancerPortion = _balancerPortion;

        emit WeightsUpdated(_uniswapPortion, _balancerPortion);
    }

    function _deposit(
        uint256 assets,
        address receiver
    ) internal virtual override returns (uint256 total) {
        total = assets;
        // swap ETH to rETH
        total += _swapToUnderlying(msg.value);
        uint256 shares = _previewAssetsToShares(total);

        if (assets > 0) {
            // Transfer the assets to the vault
            IERC20(_underlying).safeTransferFrom(msg.sender, address(this), assets);
        }

        _mint(receiver, shares);
    }

    function _previewAssetsToShares(
        uint256 assets
    ) internal view returns (uint256 shares) {
        uint256 issuedShares = totalSupply(); // number of already issued shares
        if (issuedShares == 0) {
            return assets; // first deposit
        }
        uint256 totalRETH = _totalAssets();
        require(totalRETH > 0, "_previewAssetsToShares: Invalid total assets");

        // compute share value
        uint256 shareValue = (issuedShares * SCALE) / totalRETH;
        // compute shares
        shares = (assets * shareValue) / SCALE;
    }

    function _previewSharesToAssets(
        uint256 shares
    ) internal view returns (uint256 assets) {
        uint256 totalRETH = _totalAssets();
        assets = (shares * totalRETH) / SCALE;
    }

    // Swap ETH to rETH
    function _swapToUnderlying(uint256 amount) internal returns (uint256) {
        // Get the current balance of this contract in ETH
        uint256 balanceBefore = address(this).balance;
        uint256 assetBalanceBefore = super._totalAssets();
        uint256 _idealTokensOut = amount;
        uint256 _minTokenOut = amount * 1e15 * 997 / _oracle.getValueInEth(_underlying); // 0.3% slippage

        // Swap ETH to rETH
        IRocketPoolRouter(_router).swapTo{value: amount}(
            uniswapPortion,
            balancerPortion,
            _minTokenOut,
            _idealTokensOut
        );

        // Get the current balance of this contract in ETH
        if (address(this).balance == balanceBefore) {
            // No ETH was swapped
            return 0;
        }

        uint256 assetBalanceAfter = super._totalAssets();
        if (assetBalanceAfter == assetBalanceBefore) {
            // No rETH was received
            return 0;
        }

        uint256 delta = assetBalanceAfter - assetBalanceBefore;
        return delta;
    }

    function _queueWithdraw(
        uint256 shares,
        address receiver,
        address owner
    ) internal returns (uint256 index, uint256 cliff) {
        // Get share price in rETH
        uint256 assets = _previewSharesToAssets(shares);
        // burn
        uint256 amountToBeBurned = (shares * totalSupply()) / SCALE;
        _burn(msg.sender, amountToBeBurned);
        IERC20(_underlying).approve(_uniV3Router, assets);

        // swap rETH to wETH9
        uint minAmountOut = _oracle.getValueInEth(_underlying) * assets * 997 / 1e21; // 0.3% slippage
        uint256 weth = Swap.swapWithMaximumSlippageRETH(_uniV3Router, 100, _underlying, _weth, address(this), assets, minAmountOut);
        pendingWithdraws += weth; // Add the assets to the pending withdraws
        cliff = block.timestamp + 10 days;
        IDelegationManager.Withdrawal memory w;

        Queue memory queue = Queue({
            amount: weth, // user is owed this amount
            receiver: receiver,
            owner: owner,
            cliff: cliff,
            processed: false,
            withdrawalRequest: w,
            asset: _underlying
        });

        index = nextWithdrawIndex;
        withdrawQueue[index] = queue;

        unchecked {
            nextWithdrawIndex++;
        }

        return (index, cliff);
    }

    function _withdraw(uint256 index) internal returns (uint256 assets) {
        Queue storage _withdrawQueue = withdrawQueue[index];

        if (_withdrawQueue.cliff > block.timestamp) {
            return 0;
        }

        if (_withdrawQueue.processed) {
            return 0;
        }

        // Burn the shares from the vault
        _withdrawQueue.processed = true;
        withdrawQueue[index] = _withdrawQueue;
        pendingWithdraws -= _withdrawQueue.amount;

        // Trade shares for rETH and back to ETH
        uint256 balanceEthBefore = address(this).balance;
        wETH9(_weth).withdraw(_withdrawQueue.amount);
        uint256 balanceEthAfter = address(this).balance;
        assets = balanceEthAfter - balanceEthBefore;

        withdrawQueue[index].processed = true;

        // do native eth transfer
        (bool sent, ) = payable(_withdrawQueue.receiver).call{value: assets}(
            ""
        );
        require(sent, "_withdraw: Failed to send Ether");
    }

    function _emergencyWithdraw(address who) internal {
        uint256 assets = _totalAssets();
        if (assets > 0) {
            IERC20(_underlying).safeTransfer(who, assets);
        }

        if (address(this).balance > 0) {
            (bool sent, ) = payable(who).call{value: address(this).balance}("");
            require(sent, "_emergencyWithdraw: Failed to send Ether");
        }
    }

    receive() external payable {}

    event WeightsUpdated(uint256 uniswapPortion, uint256 balancerPortion);
}
