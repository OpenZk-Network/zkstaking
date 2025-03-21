// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {IRocketPoolRouter} from "../vendors/RocketPool/IRocketPoolRouter.sol";

// Mock contract for testing
contract MockRPLRouter is IRocketPoolRouter {
    function swapFrom(
        uint256 _uniswapPortion,
        uint256 _balancerPortion,
        uint256 _minTokensOut,
        uint256 _idealTokensOut,
        uint256 _tokensIn
    ) external {}

    function swapTo(
        uint256 _uniswapPortion,
        uint256 _balancerPortion,
        uint256 _minTokensOut,
        uint256 _idealTokensOut
    ) external payable {}
}
