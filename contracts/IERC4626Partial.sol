// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

interface IERC4626Partial {
    function asset() external view returns (address);
//    function canWithdraw(uint256 index) external view returns (bool);
    function deposit(
        uint256 assets,
        address receiver
    ) external payable returns (uint256 shares);
    function queueWithdraw(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 index, uint256 cliff);
    function withdraw(uint256 index) external returns (uint256 assets);
    function totalAssets() external view returns (uint256);
    function virtualBalance() external returns (uint256);

    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 shares
    );
    event Withdraw(address indexed sender, uint256 assets);
    event QueueWithdraw(
        address indexed sender,
        uint256 shares,
        address indexed receiver,
        address indexed owner,
        uint256 cliff,
        uint256 nonce
    );
}
