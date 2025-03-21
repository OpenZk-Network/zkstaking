// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

interface IConverter {
    function daiToUsds(address usr, uint256 wad) external;

    function usdsToDai(address usr, uint256 wad) external;
}
