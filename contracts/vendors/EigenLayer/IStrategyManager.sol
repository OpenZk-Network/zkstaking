// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.27;

import {IStrategy} from "./IStrategy.sol";

// https://docs.eigenlayer.xyz/eigenlayer/restaking-guides/restaking-developer-guide
interface IStrategyManager {
    function depositIntoStrategy(
        address strategy,
        address token,
        uint256 amount
    ) external;

    function getDeposits(
        address staker
    ) external view;
}
