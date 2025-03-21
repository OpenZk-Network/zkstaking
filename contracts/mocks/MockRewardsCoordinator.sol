// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import {IRewardsCoordinator} from "../vendors/EigenLayer/IRewardsCoordinator.sol";
import { OperatorSet } from "../vendors/libraries/OperatorSetLib.sol";

/**
 * @title MockRewardsCoordinator
 * @notice A simplified mock that simulates processing rewards claims by sending tokens to a recipient.
 */
contract MockRewardsCoordinator is IRewardsCoordinator {
    event ProcessedClaim(address indexed recipient, address indexed token, uint256 amount);

    /**
     * @notice Processes a rewards claim by transferring tokens to the recipient.
     * @param _claim The rewards claim containing the token rewards to be sent.
     * @param recipient The address that will receive the tokens.
     */
    function processClaim(IRewardsCoordinator.RewardsMerkleClaim calldata _claim, address recipient) external override {
        for (uint256 i = 0; i < _claim.tokenLeaves.length; i++) {
            IRewardsCoordinator.TokenTreeMerkleLeaf calldata leaf = _claim.tokenLeaves[i];
            require(leaf.token.transfer(recipient, leaf.cumulativeEarnings), "Transfer failed");
            emit ProcessedClaim(recipient, address(leaf.token), leaf.cumulativeEarnings);
        }
    }

    // FUNCTIONS THAT CAN BE PURE

    function initialize(
        address /*param1*/,
        uint256 /*param2*/,
        address /*param3*/,
        uint32 /*param4*/,
        uint16 /*param5*/
    ) external pure override {
        revert("Not implemented");
    }

    function createAVSRewardsSubmission(
        IRewardsCoordinator.RewardsSubmission[] calldata /*submissions*/
    ) external pure override {
        revert("Not implemented");
    }

    function createRewardsForAllSubmission(
        IRewardsCoordinator.RewardsSubmission[] calldata /*submissions*/
    ) external pure override {
        revert("Not implemented");
    }

    function createRewardsForAllEarners(
        IRewardsCoordinator.RewardsSubmission[] calldata /*submissions*/
    ) external pure override {
        revert("Not implemented");
    }

    function createOperatorDirectedAVSRewardsSubmission(
        address /*avs*/,
        IRewardsCoordinator.OperatorDirectedRewardsSubmission[] calldata /*submissions*/
    ) external pure override {
        revert("Not implemented");
    }

    function createOperatorDirectedOperatorSetRewardsSubmission(
        OperatorSet calldata /*operatorSet*/,
        IRewardsCoordinator.OperatorDirectedRewardsSubmission[] calldata /*submissions*/
    ) external pure override {
        revert("Not implemented");
    }

    function processClaims(
        IRewardsCoordinator.RewardsMerkleClaim[] calldata /*claims*/,
        address /*recipient*/
    ) external pure override {
        revert("Not implemented");
    }

    function submitRoot(
        bytes32 /*root*/,
        uint32 /*index*/
    ) external pure override {
        revert("Not implemented");
    }

    function disableRoot(uint32 /*index*/) external pure override {
        revert("Not implemented");
    }

    function setClaimerFor(address /*claimer*/) external pure override {
        revert("Not implemented");
    }

    function setClaimerFor(address /*claimer*/, address /*earner*/) external pure override {
        revert("Not implemented");
    }

    function setActivationDelay(uint32 /*delay*/) external pure override {
        revert("Not implemented");
    }

    function setDefaultOperatorSplit(uint16 /*split*/) external pure override {
        revert("Not implemented");
    }

    function setOperatorAVSSplit(
        address /*operator*/,
        address /*avs*/,
        uint16 /*split*/
    ) external pure override {
        revert("Not implemented");
    }

    function setOperatorPISplit(address /*operator*/, uint16 /*split*/)
    external pure override {
        revert("Not implemented");
    }

    function setOperatorSetSplit(
        address /*operator*/,
        OperatorSet calldata /*operatorSet*/,
        uint16 /*split*/
    ) external pure override {
        revert("Not implemented");
    }

    function setRewardsUpdater(address /*updater*/) external pure override {
        revert("Not implemented");
    }

    function setRewardsForAllSubmitter(
        address /*submitter*/,
        bool /*status*/
    ) external pure override {
        revert("Not implemented");
    }

    // VIEW FUNCTIONS

    function activationDelay() external pure override returns (uint32) {
        return 0;
    }

    function currRewardsCalculationEndTimestamp()
    external pure override returns (uint32) {
        return 0;
    }

    function claimerFor(address /*earner*/)
    external pure override returns (address) {
        return address(0);
    }

    function cumulativeClaimed(
        address /*claimer*/,
        IERC20 /*token*/
    ) external pure override returns (uint256) {
        return 0;
    }

    function defaultOperatorSplitBips()
    external pure override returns (uint16) {
        return 0;
    }

    function getOperatorAVSSplit(
        address /*operator*/,
        address /*avs*/
    ) external pure override returns (uint16) {
        return 0;
    }

    function getOperatorPISplit(address /*operator*/)
    external pure override returns (uint16) {
        return 0;
    }

    function getOperatorSetSplit(
        address /*operator*/,
        OperatorSet calldata /*operatorSet*/
    ) external pure override returns (uint16) {
        return 0;
    }

    function calculateEarnerLeafHash(
        IRewardsCoordinator.EarnerTreeMerkleLeaf calldata leaf
    ) external pure override returns (bytes32) {
        return keccak256(abi.encode(leaf));
    }

    function calculateTokenLeafHash(
        IRewardsCoordinator.TokenTreeMerkleLeaf calldata leaf
    ) external pure override returns (bytes32) {
        return keccak256(abi.encode(leaf));
    }

    function checkClaim(
        IRewardsCoordinator.RewardsMerkleClaim calldata /*claim*/
    ) external pure override returns (bool) {
        return true;
    }

    function getDistributionRootsLength()
    external pure override returns (uint256) {
        return 0;
    }

    function getDistributionRootAtIndex(
        uint256 /*index*/
    ) external pure override returns (IRewardsCoordinator.DistributionRoot memory) {
        IRewardsCoordinator.DistributionRoot memory root;
        return root;
    }

    function getCurrentDistributionRoot()
    external pure override returns (IRewardsCoordinator.DistributionRoot memory) {
        IRewardsCoordinator.DistributionRoot memory root;
        return root;
    }

    function getCurrentClaimableDistributionRoot()
    external pure override returns (IRewardsCoordinator.DistributionRoot memory) {
        IRewardsCoordinator.DistributionRoot memory root;
        return root;
    }

    function getRootIndexFromHash(
        bytes32 /*rootHash*/
    ) external pure override returns (uint32) {
        return 0;
    }

    function rewardsUpdater() external pure override returns (address) {
        return address(0);
    }

    function CALCULATION_INTERVAL_SECONDS()
    external pure override returns (uint32) {
        return 0;
    }

    function MAX_REWARDS_DURATION()
    external pure override returns (uint32) {
        return 0;
    }

    function MAX_RETROACTIVE_LENGTH()
    external pure override returns (uint32) {
        return 0;
    }

    function MAX_FUTURE_LENGTH()
    external pure override returns (uint32) {
        return 0;
    }

    function GENESIS_REWARDS_TIMESTAMP()
    external pure override returns (uint32) {
        return 0;
    }
}