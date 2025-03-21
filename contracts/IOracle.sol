// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

interface IOracle {
    function getValueInEth(address token) external returns (uint256);
}
