// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {IOracle} from "../IOracle.sol";

contract MockOracle is IOracle {
    uint256 public _value;

    constructor() {
        _value = 1e18;
    }

    function setValue(uint256 value) external returns (uint256) {
        return _value = value;
    }

    function getValueInEth(address) external view returns (uint256) {
        return _value;
    }
}
