// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import {IOracle} from "./IOracle.sol";

interface IRestake is IOracle {
    function shares() external view returns (uint256);
    function restake() external;
    function queueUnstake() external;
    function unstake() external;

    event QueuedUnstake(uint256 amount, uint256 index);
    event Restaked(uint256 amount);
    event Unstaked(uint256 amount);
}
