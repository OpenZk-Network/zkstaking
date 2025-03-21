// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IConverter} from "../vendors/SkyMoney/IConverter.sol";
import {Swap} from "./Swap.sol";
import {IUSDVault} from "../interfaces/IUSDVault.sol";

contract ozUSDVault is IUSDVault, ReentrancyGuard, Ownable, ERC20 {
    using SafeERC20 for IERC20;

    event NewCliff(uint256 cliff);
    event NewFee(uint24 fee);
    event Withdrawn(address indexed owner, uint256 amount, uint256 index);
    event TokenAllowed(address indexed token, bool allowed);
    event QueueWithdraw(
        address indexed owner,
        address indexed receiver,
        uint256 shares,
        uint256 amountReceived,
        address asset,
        uint256 cliff,
        uint256 index
    );

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

    uint24 private _fee;
    address private immutable _self;
    address public immutable _underlying;
    address public immutable _univ3router; // 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 for mainnet

    address public immutable sUSDSVault; // 0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD for mainnet
    address public immutable _asset;
    address public immutable converter; // 0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A for mainnet
    uint256 public _cliff = 3 days;
    mapping (address => bool) public isAllowedToken; // initialized with DAI underlying as allowed

    // modifiers

    modifier onlyAllowedToken(address token) {
        require(isAllowedToken[token], "onlyAllowedToken: token not allowed");
        _;
    }

    constructor(
        address underlying,
        address owner,
        uint24 fee,
        address sUSDSVault_,
        address converter_,
        address uniV3Router
    ) ERC20("ozUSD", "ozUSD") Ownable(owner) {
        require(underlying != address(0), "sv: underlying 0");
        require(owner != address(0), "v: owner 0");
        require(sUSDSVault_ != address(0), "v: vault 0");
        require(converter_ != address(0), "v: converter 0");
        require(uniV3Router != address(0), "v: router 0");
        sUSDSVault = sUSDSVault_;
        converter = converter_;
        _underlying = underlying; // DAI for example
        _asset = IERC4626(sUSDSVault).asset(); // USDS
        _self = address(this);
        _fee = fee;
        _univ3router = uniV3Router;
        isAllowedToken[_underlying] = true;
    }

    function allowToken(address token, bool allow) external onlyOwner {
        require(token != address(0), "allowToken: token cannot be zero address");
        isAllowedToken[token] = allow;
        emit TokenAllowed(token, allow);
    }

    function deposit(
        uint256 assets,
        address receiver
    ) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "deposit: amount must be greater than 0");

        // Transfer underlying to the vault
        IERC20(_underlying).safeTransferFrom(_msgSender(), _self, assets);
        return _depositUnderlying(assets, receiver);
    }

    function depositToken(
        address token,
        uint256 assets,
        address receiver
    ) external nonReentrant onlyAllowedToken(token) returns (uint256 shares) {
        require(assets > 0, "deposit: amount must be greater than 0");

        // Transfer tokens to the vault
        IERC20(token).safeTransferFrom(_msgSender(), _self, assets);
        IERC20(token).safeIncreaseAllowance(_univ3router, assets);
        uint256 amountReceived = Swap.swapWithMaximumSlippage(
            _univ3router,
            _fee,
            token,
            _underlying,
            _self,
            assets
        );

        shares = _depositUnderlying(amountReceived, receiver);
    }

    function queueWithdraw(
        uint256 shares
    ) external returns (uint256 index, uint256 cliff) {
        require(shares > 0, "queueWithdraw: shares must be greater than 0");
        uint256 dai = _beginQueue(shares);
        require(dai > 0, "queueWithdraw: swapped dia must be greater than 0");
        emit QueueWithdraw(
            _msgSender(),
            _msgSender(),
            shares,
            dai,
            _underlying,
            block.timestamp + _cliff,
            nextWithdrawIndex
        );
        return
            _queueWithdrawToken(dai, _msgSender(), _msgSender(), _underlying);
    }

    function queueWithdrawToken(
        uint256 shares,
        address token
    ) external onlyAllowedToken(token) returns (uint256 index, uint256 cliff) {
        require(
            shares > 0,
            "queueWithdrawToken: shares must be greater than 0"
        );

        // returns the DAI amount we got out of sUSDS Vault
        uint256 dai = _beginQueue(shares);

        // approve dai to uni V3 Router
        IERC20(_underlying).safeIncreaseAllowance(_univ3router, dai);
        // Swap DAI to the token we want it out into
        uint256 amountSwapped = Swap.swapWithMaximumSlippage(
            _univ3router,
            _fee,
            _underlying,
            token,
            _self,
            dai
        );
        emit QueueWithdraw(
            _msgSender(),
            _msgSender(),
            shares,
            amountSwapped,
            token,
            block.timestamp + _cliff,
            nextWithdrawIndex
        );
        return
            _queueWithdrawToken(
                amountSwapped,
                _msgSender(),
                _msgSender(),
                token
            );
    }

    function withdraw(uint256 index) external returns (uint256 amount) {
        require(
            withdrawQueue[index].owner == _msgSender(),
            "withdraw: only account owner can withdraw"
        );

        Queue storage queue = withdrawQueue[index];
        require(queue.amount > 0, "withdraw: amount must be greater than 0");
        require(
            queue.cliff <= block.timestamp,
            "withdraw: cliff not reached yet"
        );
        require(!queue.processed, "withdraw: already processed");

        queue.processed = true;
        amount = queue.amount;

        IERC20(queue.asset).safeTransfer(queue.receiver, amount);
        emit Withdrawn(_msgSender(), amount, index);
    }

    /**
     * @notice Set the new cliff
     * @param cliff The new cliff
     */
    function setNewCliff(uint256 cliff) external onlyOwner {
        _cliff = cliff;
        emit NewCliff(cliff);
    }

    /**
     * @notice Set the new fee
     * @param fee The new fee
     */
    function setNewFee(uint24 fee) external onlyOwner {
        _fee = fee;
        emit NewFee(fee);
    }

    function getFee() external view returns (uint256) {
        return _fee;
    }

    function asset() external view returns (address) {
        return _underlying;
    }

    function canWithdraw(uint256 index) external view returns (bool) {
        Queue memory queue = withdrawQueue[index];
        return
            queue.amount > 0 &&
            queue.cliff <= block.timestamp &&
            !queue.processed;
    }

    // Burn shares and swap back to underlying DAI
    function _beginQueue(uint256 shares) private returns (uint256) {
        _burn(_msgSender(), shares);

        // Withdraw underlying asset usds from sUSDSVault
        uint256 assetsBefore = IERC20(_asset).balanceOf(_self);

        uint256 usds = IERC4626(sUSDSVault).redeem(shares, _self, _self);

        uint256 assetsAfter = IERC20(_asset).balanceOf(_self);
        uint256 assets = assetsAfter - assetsBefore;
        require(assets > 0, "_beginQueue: assets must be greater than 0");

        // Swap asset to underlying DAI
        uint256 underlyingBefore = IERC20(_underlying).balanceOf(_self);
        IERC20(_asset).safeIncreaseAllowance(converter, usds);
        IConverter(converter).usdsToDai(_self, usds);
        uint256 underlyingAfter = IERC20(_underlying).balanceOf(_self);
        uint256 swappedAmount = underlyingAfter - underlyingBefore;

        return swappedAmount;
    }

    function _queueWithdrawToken(
        uint256 amount,
        address receiver,
        address owner,
        address token
    ) private returns (uint256 index, uint256 cliff) {
        cliff = block.timestamp + _cliff;
        Queue memory queue = Queue({
            amount: amount,
            receiver: receiver,
            owner: owner,
            cliff: cliff,
            processed: false,
            asset: token
        });

        index = nextWithdrawIndex;
        withdrawQueue[index] = queue;

        unchecked {
            nextWithdrawIndex++;
        }
    }

    function _depositUnderlying(
        uint256 assets,
        address receiver
    ) private returns (uint256 shares) {
        // Swap underlying to asset
        uint256 usdsBefore = IERC20(_asset).balanceOf(_self);

        IERC20(_underlying).safeIncreaseAllowance(converter, assets);
        IConverter(converter).daiToUsds(_self, assets);
        uint256 usdsAfter = IERC20(_asset).balanceOf(_self);

        uint256 swappedAmount = usdsAfter - usdsBefore;
        require(
            swappedAmount > 0,
            "deposit: swapped amount must be greater than 0"
        );

        // Approve sUSDSVault to spend swappedAmount
        IERC20(_asset).safeIncreaseAllowance(sUSDSVault, swappedAmount);

        uint256 sharesBefore = IERC20(sUSDSVault).balanceOf(_self);
        IERC4626(sUSDSVault).deposit(swappedAmount, _self);
        uint256 sharesAfter = IERC20(sUSDSVault).balanceOf(_self);

        require(sharesAfter > sharesBefore, "_depositUnderlying: invalid received shares");
        shares = sharesAfter - sharesBefore;
        require(shares > 0, "_depositUnderlying: shares must be greater than 0");

        _mint(receiver, shares);
    }
}
