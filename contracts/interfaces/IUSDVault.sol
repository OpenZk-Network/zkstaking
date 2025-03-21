// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

interface IUSDVault {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function depositToken(address token, uint256 assets, address receiver) external returns (uint256 shares);
    function queueWithdraw(uint256 shares) external returns (uint256 index, uint256 cliff);
    function queueWithdrawToken(uint256 shares, address token) external returns (uint256 index, uint256 cliff);
    function withdraw(uint256 index) external returns (uint256 amount);
    function setNewCliff (uint256 cliff) external;
    function canWithdraw(uint256 index) external view returns (bool);
}