// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IOracle} from "../IOracle.sol";
import {IDelegationManager} from "../vendors/EigenLayer/IDelegationManager.sol";
import {ISwapRouter} from "../vendors/Uniswap/ISwapRouter.sol";
import {IConverter} from "../vendors/SkyMoney/IConverter.sol";
import {IUSDVault} from "../interfaces/IUSDVault.sol";

contract MockSkyMoneyVault is IUSDVault, ERC20 {

    event NewCliff(uint256 cliff);

    struct Queue {
        uint256 amount;
        address receiver;
        address owner;
        uint256 cliff;
        bool processed;
        address asset;
    }

    uint256 public nextWithdrawIndex;
    mapping(uint256 => Queue) public withdrawQueue;
    uint256 public pendingWithdraws; // Assets in ETH pending to be withdrawn

    address private _asset;
    uint256 public _cliff = 3 days;

    uint256 public mockRate = 999_000;

    function asset() external view returns (address) {
        return _asset;
    }

    constructor(
        address asset_
    ) ERC20("mockozUSD", "mockozUSD") {
        _asset = asset_;
    }

    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256 shares) {
        shares = assets * 1_000_000 / mockRate;
        _mint(receiver, shares);
    }

    function depositToken(address, uint256 assets, address receiver) external returns (uint256 shares) {
        shares = assets * 1_000_000 / mockRate;
        _mint(receiver, shares);
    }

    function queueWithdraw(uint256 shares) external returns (uint256 index, uint256 cliff) {
        index = nextWithdrawIndex;
        cliff = block.timestamp + _cliff;
        withdrawQueue[nextWithdrawIndex] = Queue(shares, address(0), msg.sender, cliff, false, _asset);
        nextWithdrawIndex++;
    }

    function queueWithdrawToken(
        uint256 shares,
        address token
    ) external returns (uint256 index, uint256 cliff) {
        index = nextWithdrawIndex;
        cliff = block.timestamp + _cliff;
        withdrawQueue[nextWithdrawIndex] = Queue(shares, address(0), msg.sender, cliff, false, token);
        nextWithdrawIndex++;
    }

    function withdraw(uint256 index) external returns (uint256 amount) {
        amount = withdrawQueue[index].amount;
        address receiver = withdrawQueue[index].receiver;
        withdrawQueue[index].processed = true;
        _burn(receiver, amount);
    }

    /**
     * @notice Set the new cliff
     * @param cliff The new cliff
     */
    function setNewCliff (uint256 cliff) external {
        _cliff = cliff;
        emit NewCliff(cliff);
    }

    function canWithdraw(uint256 index) external view returns (bool) {
        Queue memory queue = withdrawQueue[index];
        return
            queue.owner == _msgSender() &&
            queue.amount > 0 &&
            queue.cliff <= block.timestamp &&
            !queue.processed;
    }

    function setMockWithdrawCliff(uint256 index, uint256 cliff) external {
        withdrawQueue[index].cliff = cliff;
    }

    function setMockWithdrawAmount(uint256 index, uint256 amount) external {
        withdrawQueue[index].amount = amount;
    }

    function setMockWithdrawProcessed(uint256 index, bool processed) external {
        withdrawQueue[index].processed = processed;
    }

    function setMockRate(uint256 rate) external {
        mockRate = rate;
    }
}