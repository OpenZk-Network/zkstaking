// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

interface IMintable {
    function mint(address account, uint256 amount) external;
}

interface IBurnable {
    function burn(address account, uint256 amount) external;
}

interface IMintAndBurn is IMintable, IBurnable {}
