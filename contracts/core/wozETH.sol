// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract wozETH is ERC20Burnable, ReentrancyGuard {
    constructor() ERC20("wozETH", "Wrapped ozETH") {
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "wozETH: INSUFFICIENT_BALANCE");
        _burn(msg.sender, amount);
        msg.sender.call{ value: amount }("");
    }
}
