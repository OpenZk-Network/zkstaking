// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IMintAndBurn} from "./IMintAndBurn.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ozETH is ERC20, AccessControl, ReentrancyGuard, IMintAndBurn {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    constructor(address _defaultAdmin) payable ERC20("ozETH", "ozETH") {
        if (_defaultAdmin == address(0)) {
            _defaultAdmin = msg.sender;
        }
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);

        if (msg.value > 0) {
            _mint(msg.sender, msg.value);
        }
    }

    function mint(
        address to,
        uint256 amount
    ) external override onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(
        address from,
        uint256 amount
    ) external override onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}
