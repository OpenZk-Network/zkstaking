// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {IERC4626Partial} from "../IERC4626Partial.sol";
import {IOracle} from "../IOracle.sol";

contract MockVault is IERC4626Partial {
    uint256 private _totalAssets;
    address private immutable _asset;

    mapping(address => uint256) private _balances;

    // Price in ETH (18 decimals)
    uint256 private _mockPrice;

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    constructor(address assetAddress) {
        _asset = assetAddress;
        _mockPrice = 1e18;
    }

    // Mock function to set price for testing
    function setMockPrice(uint256 newPrice) external {
        _mockPrice = newPrice;
    }

    // IERC4626Partial implementation
    function asset() external view returns (address) {
        return _asset;
    }

    function deposit(
        uint256 assets,
        address receiver
    ) external payable returns (uint256) {
        _totalAssets += ((assets + msg.value) * 1e18) / _mockPrice;

        _balances[receiver] += ((assets + msg.value) * 1e18) / _mockPrice;

        emit Deposit(msg.sender, receiver, assets);

        return _totalAssets; // 1:1 share ratio for simplicity
    }

    function withdraw(
        uint256 assets,
        address,
        address
    ) external pure returns (uint256) {
        // require(_totalAssets >= assets, "Insufficient assets");
        // _totalAssets -= assets;
        // payable(receiver).transfer(assets);
        // emit Withdraw(msg.sender, assets);
        return assets; // 1:1 share ratio for simplicity
    }

    function totalAssets() external view returns (uint256) {
        return _totalAssets;
    }

    function setTotalAssets(uint256 newTotalAssets) external {
        _totalAssets = newTotalAssets;
    }

    function setUserBalance(address user, uint256 amount) external {
        _balances[user] = amount;
    }

    // Required to receive ETH
    receive() external payable {}

    function canWithdraw(uint256) external pure returns (bool) {
        return false;
    }

    function queueWithdraw(
        uint256,
        address,
        address
    ) external pure override returns (uint256 index, uint256 cliff) {
        return (0, 0);
    }

    function withdraw(uint256) external override returns (uint256 assets) {
        if (_useMockAssets) {
            assets = _mockAssets;
        } else {

            assets = _balances[msg.sender];
            // do native eth transfer
            (bool sent, ) = payable(msg.sender).call{value: assets}("");
        }
        return assets;
    }

    uint256 private _mockAssets;
    bool private _useMockAssets = false;

    function setWithdrawalAmount(uint256 assets, bool useMockAssets) public {
        _mockAssets = assets;
        _useMockAssets = useMockAssets;
    }

    function virtualBalance() external view returns (uint256) {
        return (_mockPrice * _totalAssets) / 1e18;
    }
}
