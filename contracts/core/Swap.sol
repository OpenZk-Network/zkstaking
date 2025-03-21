// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ISwapRouter} from "../vendors/Uniswap/ISwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library Swap {
    uint256 constant SLIPPAGE_TOLERANCE = 997_000; // 99.7%
    uint256 constant SCALE = 1_000_000;

    function approveAndSwap(
        address router,
        uint24 fee,
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).approve(router, amountIn);
        amountOut = swapWithMaximumSlippage(
            router,
            fee,
            tokenIn,
            tokenOut,
            recipient,
            amountIn
        );
    }

    function swap(
        address router,
        uint24 fee,
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        ISwapRouter swapRouter = ISwapRouter(router);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient, // send back to the caller
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        amountOut = swapRouter.exactInputSingle(params);
    }

    function swapWithMaximumSlippage(
        address router,
        uint24 fee,
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        uint256 tokenInDecimals = IERC20Metadata(tokenIn).decimals();
        uint256 tokenOutDecimals = IERC20Metadata(tokenOut).decimals();
        
        // Normalize amounts based on decimal differences
        uint256 normalizedAmountIn = amountIn;
        if (tokenOutDecimals > tokenInDecimals) {
            normalizedAmountIn = amountIn * (10 ** (tokenOutDecimals - tokenInDecimals));
        }

        // Calculate minimum amount out with slippage
        uint256 amountOutMinimum = normalizedAmountIn * SLIPPAGE_TOLERANCE / SCALE;
        
        // If output token has fewer decimals, adjust the minimum amount
        if (tokenInDecimals > tokenOutDecimals) {
            amountOutMinimum = amountOutMinimum / (10 ** (tokenInDecimals - tokenOutDecimals));
        }
        
        amountOut = swap(
            router,
            fee,
            tokenIn,
            tokenOut,
            recipient,
            amountIn,
            amountOutMinimum
        );
    }

    function swapWithMaximumSlippageRETH(
        address router,
        uint24 fee,
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        amountOut = swap(
            router,
            fee,
            tokenIn,
            tokenOut,
            recipient,
            amountIn,
            amountOutMinimum
        );
    }

    function _swapWithMultipleHops(
        ISwapRouter swapRouter,
        bytes calldata _path,
        address _recipient,
        uint256 _amountIn,
        uint256 _amountOutMinimum
    ) internal returns (uint256 amountOut){

        ISwapRouter.ExactInputParams memory params =
                            ISwapRouter.ExactInputParams({
                path: _path,
                recipient: _recipient,
                amountIn: _amountIn,
                amountOutMinimum: _amountOutMinimum
            });
        // The call to `exactInputSingle` executes the swap.
        amountOut = swapRouter.exactInput(params);
    }
}
