// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.27;

import {IConverter} from "../vendors/SkyMoney/IConverter.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockConverter is IConverter {

    uint256 public daiRate = 1e18;
    uint256 public usdsRate = 1e18;
    MockERC20 public mockDai;
    MockERC20 public mockUsds;

    constructor(address dai, address usds) {
        mockDai = MockERC20(dai);
        mockDai.mint(address(this), 100_000 * 1e18);
        mockUsds = MockERC20(usds);
        mockUsds.mint(address(this), 100_000 * 1e18);
    }

    function setDaiRate(uint256 rate) external {
        daiRate = rate;
    }

    function setUsdsRate(uint256 rate) external {
        usdsRate = rate;
    }
    
    function daiToUsds(address usr, uint256 wad) external {
        mockDai.transferFrom(msg.sender, address(this), wad);
        uint256 usds = wad * daiRate / usdsRate;
        mockUsds.mint(usr, usds);
    }

    function usdsToDai(address usr, uint256 wad) external {
        mockUsds.transferFrom(msg.sender, address(this), wad);
        uint256 dai = wad * usdsRate / daiRate;
        mockDai.mint(usr, dai);
    }
}