// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC4626Partial} from "../IERC4626Partial.sol";
import {IOracle} from "../IOracle.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {IMintAndBurn} from "./IMintAndBurn.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract LiquidityManager is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MODIFIER_ROLE = keccak256("MODIFIER_ROLE");

    using EnumerableSet for EnumerableSet.Bytes32Set;

    struct Vault {
        uint8 weight;
        address vault;
    }

    struct UnstakeRequest {
        address account;
        uint256 shares;
        uint256[] indices;
        address[] vaults;
        uint256 cliff;
        bool processed;
    }

    EnumerableSet.Bytes32Set private _vaults;
    address private immutable _self;
    uint256 private _nonce;
    uint256 public totalWeight;
    uint256 constant SCALE = 1e18;
    uint256 public immutable _vesting_period;
    address public underlying;

    mapping(uint256 => UnstakeRequest) public unstakeRequests;

    constructor(address _underlying, address _defaultAdmin) {
        require(_underlying != address(0), "lm: underlying 0");
        if (_defaultAdmin == address(0)) {
            _defaultAdmin = msg.sender;
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _self = address(this);
        _vesting_period = 10 days;
        underlying = _underlying;
    }

    function setUnderlying(address _underlying) external onlyRole(ADMIN_ROLE) {
        underlying = _underlying;

        emit UnderlyingSet(_underlying);
    }

    function getVaultCount() external view returns (uint256) {
        return _vaults.length();
    }

    function getNonce() external view returns (uint256) {
        return _nonce;
    }

    function getVaultAt(uint256 index) external view returns (Vault memory) {
        require(index < _vaults.length(), "getVaultAt: Index out of bounds");
        return _bytes32ToVault(_vaults.at(index));
    }

    // Helper function to convert Vault struct to bytes32
    function _vaultToBytes32(
        Vault memory vault
    ) internal pure returns (bytes32) {
        return
            bytes32(
                (uint256(uint8(vault.weight)) << 160) | uint160(vault.vault)
            );
    }

    // Helper function to convert bytes32 to Vault struct
    function _bytes32ToVault(
        bytes32 data
    ) internal pure returns (Vault memory) {
        uint8 weight = uint8(uint256(data) >> 160);
        address vault = address(uint160(uint256(data)));
        return Vault(weight, vault);
    }

    function virtualBalance() external returns (uint256) {
        return _virtualBalance();
    }

    function _virtualBalance() private returns (uint256) {
        // iterate over all vaults and calculate total value
        uint256 value;
        uint256 count = _vaults.length();
        for (uint256 i = 0; i < count; i++) {
            Vault memory v = _bytes32ToVault(_vaults.at(i));
            value += IERC4626Partial(v.vault).virtualBalance();
        }

        return value;
    }

    function previewDeposit(uint256 amount) external returns (uint256) {
        uint256 value = _virtualBalance();
        return value == 0 ? 0 : (IERC20(underlying).totalSupply() * amount) / value;
    }

    function addVault(
        address vault,
        uint8 weight
    ) external onlyRole(MODIFIER_ROLE) {
        Vault memory newVault = Vault(weight, vault);
        require(
            _vaults.add(_vaultToBytes32(newVault)),
            "addVault: Vault already exists"
        );
        totalWeight += weight;
        emit VaultAdded(vault);
    }

    function removeVault(uint256 index) external onlyRole(MODIFIER_ROLE) {
        Vault memory vaultToRemove = _bytes32ToVault(_vaults.at(index));
        require(
            _vaults.remove(_vaultToBytes32(vaultToRemove)),
            "removeVault: Vault does not exist"
        );

        totalWeight -= vaultToRemove.weight;
        emit VaultRemoved(vaultToRemove.vault);
    }

    function stake() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "stake: Invalid amount");
        require(totalWeight > 0, "stake: Total weight is 0");

        uint256 amount = msg.value;
        uint256 count = _vaults.length();

        // need to check for zero balance on first deposit
        uint256 vaultsVirtualBalance;

        for (uint256 i = 0; i < count; i++) {
            Vault memory v = _bytes32ToVault(_vaults.at(i));
            uint256 portion = (amount * v.weight) / totalWeight;

            IERC4626Partial vault = IERC4626Partial(v.vault);
            // add virtual balance of each vault to mem virtualBalance
            vaultsVirtualBalance += vault.virtualBalance();
            // Deposit assets into the vault, use 0 as there's no ERC20 token to transfer
            vault.deposit{value: portion}(0, _self);
        }

        uint256 sharesToMint = vaultsVirtualBalance == 0 /* first deposit */
            ? amount
            : (amount * IERC20(underlying).totalSupply()) /
                vaultsVirtualBalance /* amount multiplied by share value */;

        require(sharesToMint > 0, "stake: No shares to mint");

        if (sharesToMint > 0) {
            IMintAndBurn(underlying).mint(msg.sender, sharesToMint);
        }
        
        emit Staked(msg.sender, msg.value);
    }

    function queueUnstake(uint256 shares) external whenNotPaused {
        uint256 count = _vaults.length();
        // Burn the shares from the sender
        // ratio burned
        uint256 ratio = (shares * SCALE) / IERC20(underlying).totalSupply();
        // burn
        IMintAndBurn(underlying).burn(msg.sender, shares);

        uint256[] memory indices = new uint256[](count);
        address[] memory vaults = new address[](count);

        for (uint256 i = 0; i < count; i++) {
            Vault memory v = _bytes32ToVault(_vaults.at(i));
            vaults[i] = v.vault;
            IERC4626Partial vault = IERC4626Partial(v.vault);
            (uint256 index, ) = vault.queueWithdraw(ratio, _self, _self);
            indices[i] = index;
        }

        uint256 cliff = block.timestamp + _vesting_period;
        UnstakeRequest memory request = UnstakeRequest(
            msg.sender,
            shares,
            indices,
            vaults,
            cliff,
            false
        );
        _nonce++; // make sure nonce start at 1 not at 0 (default)
        unstakeRequests[_nonce] = request;
        emit UnstakeQueued(msg.sender, shares, cliff, _nonce);
    }

    function unstake(uint256 nonce) external nonReentrant whenNotPaused {
        UnstakeRequest storage request = unstakeRequests[nonce];
        require(!request.processed, "unstake: Request already processed");
        require(request.account == msg.sender, "unstake: Invalid request");
        require(block.timestamp >= request.cliff, "unstake: Cliff not reached");

        request.processed = true;
        uint256 assets;
        uint256 count = request.indices.length;

        for (uint256 i = 0; i < count; i++) {
            IERC4626Partial vault = IERC4626Partial(request.vaults[i]);
            assets += vault.withdraw(request.indices[i]); // this throws if not ready
        }

        require(assets > 0, "unstake: No assets withdrawn");
        unstakeRequests[nonce].processed = true;
        // do native eth transfer
        (bool sent, ) = payable(msg.sender).call{value: assets}("");
        require(sent, "Failed to send Ether");

        emit Unstaked(msg.sender, assets, nonce);
    }

    /*
     * @notice Rebalance the vaults
     */
    function rebalance() external onlyRole(ADMIN_ROLE) {
        uint256 count = _vaults.length();
        for (uint256 i = 0; i < count; i++) {
            Vault memory v = _bytes32ToVault(_vaults.at(i));
            IERC4626Partial vault = IERC4626Partial(v.vault);
            address asset = vault.asset();
            uint256 assets = IERC20(asset).balanceOf(_self);

            if (assets > 0) {
                vault.deposit(assets, _self);
            }
        }
    }

    /*
     * @notice Pause or Unpause the contract
     */
    function togglePause() external onlyRole(ADMIN_ROLE) {
        paused() ? _unpause() : _pause();
    }

    receive() external payable {}

    event Staked(address indexed account, uint256 assets);
    event UnderlyingSet(address indexed underlying);
    event Unstaked(address indexed account, uint256 assets, uint256 nonce);
    event UnstakeQueued(address indexed account, uint256 shares, uint256 cliff, uint256 nonce);
    event VaultAdded(address indexed vault);
    event VaultRemoved(address indexed vault);
}
