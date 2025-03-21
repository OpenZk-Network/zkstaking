// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {IConverter} from "../vendors/SkyMoney/IConverter.sol";
import {MockERC20} from "./MockERC20.sol";
import {ISwapRouter} from "../vendors/Uniswap/ISwapRouter.sol";
import {MockERC20} from "./MockERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

contract MocksUSDSVault is MockERC20, IERC4626 {

    MockERC20 public mockUsds;
    MockERC20 public mocksUSDS;

    function ratio (uint256 amount) internal pure returns (uint256) {
        return amount * 950_000 / 1_000_000;
    }

    function inverseRatio (uint256 amount) internal pure returns (uint256) {
        return amount * 1_000_000 / 950_000;
    }

    constructor(address usds) MockERC20("USDS Vault", "sUSDS") {
        mockUsds = MockERC20(usds);
        mockUsds.mint(address(this), 100_000 * 1e18);
    }


    function asset() external view returns (address) {
        // implementation
        return address(mockUsds);
    }

    function totalAssets() external view returns (uint256) {
        return balanceOf(address(this));
    }

    function convertToShares(uint256 assets) external pure returns (uint256) {
        return ratio(assets);
    }

    function mint(uint256 shares, address receiver) external returns (uint256 assets) {
        assets = inverseRatio(shares);
        _mint(receiver, shares);
    }

    function convertToAssets(uint256 shares) external pure returns (uint256) {
        return inverseRatio(shares);
    }

    function maxDeposit(address) external pure returns (uint256) {
        return 1e28;
    }

    function previewDeposit(uint256 assets) external pure returns (uint256) {
        return ratio(assets);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        uint256 shares = ratio(assets);
        _mint(receiver, shares);
        mockUsds.transferFrom(receiver, address(this), assets);
        return shares;
    }

    function maxMint(address) external pure returns (uint256) {
        return 1e28;
    }

    function previewMint(uint256 shares) external pure returns (uint256) {
        return inverseRatio(shares);
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return inverseRatio(balanceOf(owner));
    }

    function previewWithdraw(uint256 assets) external pure returns (uint256) {
        return ratio(assets);
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256) {
        uint256 shares = ratio(assets);
        _burn(owner, shares);
        mockUsds.transfer(receiver, assets);
        return shares;
    }

    function maxRedeem(address owner) external view returns (uint256) {
        return inverseRatio(balanceOf(owner));
    }

    function previewRedeem(uint256 shares) external pure returns (uint256) {
        return inverseRatio(shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256) {
        uint256 amount = inverseRatio(shares);
        mockUsds.transfer(receiver, amount);
        _burn(owner, shares);
        return amount;
    }

}