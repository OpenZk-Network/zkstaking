// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {IConverter} from "../vendors/SkyMoney/IConverter.sol";
import {MockERC20} from "./MockERC20.sol";
import {ISwapRouter} from "../vendors/Uniswap/ISwapRouter.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockSwapRouter is ISwapRouter {


    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut) {
        amountOut = params.amountIn * 990_000 / 1_000_000;
        MockERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        MockERC20(params.tokenOut).mint(msg.sender, amountOut);
    }

    function exactInput(
        ExactInputParams calldata params
    ) external payable returns (uint256 amountOut) {
        // do nothing
    }
}