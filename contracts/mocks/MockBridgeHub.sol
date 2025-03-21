// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IBridgehub, L2TransactionRequestDirect, L2TransactionRequestTwoBridgesOuter} from "../vendors/zksync/bridgehub/IBridgehub.sol";
import {IL1SharedBridge} from "../vendors/zksync/bridge/interfaces/IL1SharedBridge.sol";
import {L2Message, L2Log, TxStatus} from "../vendors/zksync/common/Messaging.sol";


contract MockBridgeHub is IBridgehub {
    // --- Admin Variables ---
    address public admin;
    address public pendingAdmin;

    // --- Registry Mappings ---
    mapping(uint256 => address) private _stateTransitionManagers;
    mapping(address => bool) private _stateTransitionManagerRegistered;
    mapping(uint256 => address) private _baseTokens;
    mapping(address => bool) private _registeredTokens;
    mapping(uint256 => address) private _hyperchains;

    // --- Other Variables ---
    IL1SharedBridge private _sharedBridge;
    uint256 public l2TransactionBaseCostValue = 1000000000000000;
    bytes32 public canonicalTxHash;

    // --- Constructor ---
    constructor() {
        admin = msg.sender;
    }

    // --- Admin Functions ---
    function setPendingAdmin(address _newPendingAdmin) external override {
        require(msg.sender == admin, "Only admin can set pending admin");
        emit NewPendingAdmin(pendingAdmin, _newPendingAdmin);
        pendingAdmin = _newPendingAdmin;
    }

    function acceptAdmin() external override {
        require(msg.sender == pendingAdmin, "Only pending admin can accept");
        emit NewAdmin(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    // --- Registry Getters ---
    function stateTransitionManagerIsRegistered(address _stateTransitionManager) external view override returns (bool) {
        return _stateTransitionManagerRegistered[_stateTransitionManager];
    }

    function stateTransitionManager(uint256 _chainId) external view override returns (address) {
        return _stateTransitionManagers[_chainId];
    }

    function tokenIsRegistered(address _baseToken) external view override returns (bool) {
        return _registeredTokens[_baseToken];
    }

    function baseToken(uint256 _chainId) external view override returns (address) {
        return _baseTokens[_chainId];
    }

    function sharedBridge() external view override returns (IL1SharedBridge) {
        return _sharedBridge;
    }

    function getHyperchain(uint256 _chainId) external view override returns (address) {
        return _hyperchains[_chainId];
    }

    // --- Mailbox Forwarder (Proof Functions) ---
    function proveL2MessageInclusion(
        uint256 /* _chainId */,
        uint256 /* _batchNumber */,
        uint256 /* _index */,
        L2Message calldata /* _message */,
        bytes32[] calldata /* _proof */
    ) external pure override returns (bool) {
        // For testing, assume proof always succeeds.
        return true;
    }

    function proveL2LogInclusion(
        uint256 /* _chainId */,
        uint256 /* _batchNumber */,
        uint256 /* _index */,
        L2Log memory /* _log */,
        bytes32[] calldata /* _proof */
    ) external pure override returns (bool) {
        // For testing, assume proof always succeeds.
        return true;
    }

    function proveL1ToL2TransactionStatus(
        uint256 /* _chainId */,
        bytes32 /* _l2TxHash */,
        uint256 /* _l2BatchNumber */,
        uint256 /* _l2MessageIndex */,
        uint16 /* _l2TxNumberInBatch */,
        bytes32[] calldata /* _merkleProof */,
        TxStatus /* _status */
    ) external pure override returns (bool) {
        // For testing, assume status is always correctly proven.
        return true;
    }

    // --- Transaction Request Functions ---
    function requestL2TransactionDirect(
        L2TransactionRequestDirect calldata /* _request */
    ) external payable override returns (bytes32) {
        // Return the preset canonical transaction hash.
        return canonicalTxHash;
    }

    function requestL2TransactionTwoBridges(
        L2TransactionRequestTwoBridgesOuter calldata /* _request */
    ) external payable override returns (bytes32) {
        // Return the preset canonical transaction hash.
        return canonicalTxHash;
    }

    function l2TransactionBaseCost(
        uint256 /* _chainId */,
        uint256 /* _gasPrice */,
        uint256 /* _l2GasLimit */,
        uint256 /* _l2GasPerPubdataByteLimit */
    ) external view override returns (uint256) {
        return l2TransactionBaseCostValue;
    }

    function setl2TransactionBaseCost(uint256 value) external {
        l2TransactionBaseCostValue = value;
    }

    // --- Registry Functions ---
    function createNewChain(
        uint256 _chainId,
        address _stateTransitionManager,
        address _baseToken,
        uint256 /* _salt */,
        address _admin,
        bytes calldata /* _initData */
    ) external override returns (uint256) {
        _stateTransitionManagers[_chainId] = _stateTransitionManager;
        _stateTransitionManagerRegistered[_stateTransitionManager] = true;
        _baseTokens[_chainId] = _baseToken;
        _hyperchains[_chainId] = _admin; // Using _admin as a placeholder hyperchain address.
        emit NewChain(_chainId, _stateTransitionManager, _admin);
        return _chainId;
    }

    function addStateTransitionManager(address _stateTransitionManager) external override {
        _stateTransitionManagerRegistered[_stateTransitionManager] = true;
    }

    function removeStateTransitionManager(address _stateTransitionManager) external override {
        _stateTransitionManagerRegistered[_stateTransitionManager] = false;
    }

    function addToken(address _token) external override {
        _registeredTokens[_token] = true;
    }

    function setSharedBridge(address _sharedBridgeAddress) external override {
        _sharedBridge = IL1SharedBridge(_sharedBridgeAddress);
    }

    function setCanonicalTxHash(bytes32 _hash) external {
        canonicalTxHash = _hash;
    }
}
