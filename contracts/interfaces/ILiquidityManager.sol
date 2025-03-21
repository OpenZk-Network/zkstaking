// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;


interface ILiquidityManager {
    function stake() payable external;
    function virtualBalance() external returns (uint256);

}
