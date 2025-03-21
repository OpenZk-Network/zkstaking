// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IStrategy} from "../vendors/EigenLayer/IStrategy.sol";
import {IDelegationManager} from "../vendors/EigenLayer/IDelegationManager.sol";
import {IStrategyManager} from "../vendors/EigenLayer/IStrategyManager.sol";
import {IRestake} from "../IRestake.sol";

contract MockEigenLayer is ERC20, IRestake {
    function shares() external pure returns (uint256) {
        return 0;
    }

    constructor() ERC20("Mock", "ME") {}

    function getValueInEth(address) external pure returns (uint256) {
        return 1e18;
    }

    function completeWithdrawal() external pure {
        // Do nothing
    }

    function depositIntoStrategy(
        address strategy,
        address token,
        uint256 amount
    ) external pure {
        // do nothing
    }

    function restake() external {
        _mint(msg.sender, 1e18);
        emit Restaked(1e18);
    }

    function queueUnstake() external pure {
        // do nothing
    }

    function unstake() external {
        _burn(msg.sender, balanceOf(msg.sender));
        emit Unstaked(0);
    }
}
