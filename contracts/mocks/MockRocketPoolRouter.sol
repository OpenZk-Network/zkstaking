// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockRocketPoolRouter {
    IERC20 public reth;

    constructor(address _reth) {
        reth = IERC20(_reth);
    }

    function swapTo(uint256, uint256, uint256, uint256) external payable {
        // Mock implementation - mint rETH tokens to simulate swap
        // reth.mint(msg.sender, amount);
    }

    function swapFrom(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256 tokensIn
    ) external {
        // Mock implementation - burn rETH tokens and send ETH
        reth.transferFrom(msg.sender, address(this), tokensIn);
        payable(msg.sender).transfer(tokensIn);
    }
}
