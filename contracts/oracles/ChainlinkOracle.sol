// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {IOracle} from "../IOracle.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ChainlinkOracle is Ownable, IOracle {
    // Chainlink rETH/eth price feed
    address public immutable QUOTER_V2; // for ethereum mainnet: 0x536218f9E9Eb48863970252233c8F271f554C2d0
    uint256 public timeThreshold = 86460; // 24 hours 1 minute in seconds (chainlink threshold is 0.5% or 1hour, added 1 minute to make sure tx is mined)
    uint256 public constant SCALE = 1e18;

    constructor(address priceFeedAddress) Ownable(msg.sender) {
        QUOTER_V2 = priceFeedAddress;
    }

    function getValueInEth(address) external view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(
            QUOTER_V2
        ).latestRoundData();
        if (price < 0) {
            revert("Invalid price");
        }

        if (updatedAt + timeThreshold < block.timestamp) {
            revert("Stale price feed");
        }
        return
            (uint256(price) * SCALE) /
            10 ** AggregatorV3Interface(QUOTER_V2).decimals(); // make sure we return in 18 decimals
    }

    function setTimeThreshold(uint256 _timeThreshold) external onlyOwner {
        timeThreshold = _timeThreshold;
    }
}
