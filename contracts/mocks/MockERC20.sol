// contracts/mocks/MockToken.sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMintAndBurn} from "../core/IMintAndBurn.sol";

contract MockERC20 is ERC20, Ownable, IMintAndBurn {
    mapping(address => bool) public minters;

    constructor(
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) Ownable(msg.sender) {}

    function grantRole(address minter) external onlyOwner {
        minters[minter] = true;
    }

    function mint(address to, uint256 amount) external {
        // require(minters[msg.sender], "Not authorized to mint");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        // require(minters[msg.sender], "Not authorized to burn");
        _burn(from, amount);
    }
}
