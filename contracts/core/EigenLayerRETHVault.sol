// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626Partial} from "./../IERC4626Partial.sol";
import {IOracle} from "./../IOracle.sol";
import "./../vendors/EigenLayer/IDelegationManager.sol";
import "./../vendors/EigenLayer/IRewardsCoordinator.sol";
import {ISignatureUtils} from "./../vendors/EigenLayer/ISignatureUtils.sol";
import {IStrategy} from "./../vendors/EigenLayer/IStrategy.sol";
import {IStrategyManager} from "./../vendors/EigenLayer/IStrategyManager.sol";
import {RocketPoolVault} from "./RocketPoolVault.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IRocketPoolRouter} from "../vendors/RocketPool/IRocketPoolRouter.sol";
import {Swap} from "./Swap.sol";
import {ISwapRouter} from "../vendors/Uniswap/ISwapRouter.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract EigenLayerRETHVault is Initializable, RocketPoolVault {

    bytes32 public constant CLAIMER_ROLE = keccak256("CLAIMER_ROLE");

    using Swap for ISwapRouter;
    using SafeERC20 for IERC20;

    event NewOperatorSet(address indexed operator);
    event RewardsClaimed();
    event TokensSwapped(address tokenIn, address tokenOut, uint256 amount);
    event ClaimWithdrawalRoots(bytes32[] withdrawalRoots);
    event QueueWithdrawalRoots(bytes32[] withdrawalRoots);

    // https://github.com/Layr-Labs/eigenlayer-contracts?tab=readme-ov-file#deployments
    address public constant strategyManager =
        0x858646372CC42E1A627fcE94aa7A7033e7CF075A;

    address public constant delegationManager =
        0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A; // delegation manager

    address public constant strategy =
        0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2; // rETH strategy

    // 0x7750d328b314EfFa365A0402CcfD489B80B0adda
    IRewardsCoordinator public immutable rewardsCoordinator;

    IRewardsCoordinatorTypes.RewardsMerkleClaim[] internal claims ;

    uint256[50] private __gap;

    constructor(address oracle, address lm, address uniV3Router, address _rewardsCoordinator) RocketPoolVault(oracle, lm, uniV3Router) {
        require(_rewardsCoordinator != address(0), "ev: rewardsCoordinator 0");
        rewardsCoordinator = IRewardsCoordinator(_rewardsCoordinator);
        _disableInitializers();
    }

    function initialize(
        uint24 _fee,
        string memory _name,
        string memory _symbol,
        address _admin,
        address _upgrader
    ) external virtual override initializer {
        __EigenLayerRETHVault_init(_fee, _name, _symbol, _admin, _upgrader);
    }

    function __EigenLayerRETHVault_init(uint24 _fee, string memory _name, string memory _symbol, address _admin, address _upgrader) internal onlyInitializing {
        __RocketPoolVault_init(_fee, _name, _symbol, _admin, _upgrader);
        // allow strategyManager to transfer _underlying from this vault
        IERC20(_underlying).forceApprove(strategyManager, type(uint256).max);
    }

    /*
     * @notice Deposit assets into the vault
     * @param assets The amount of assets to deposit
     * @param receiver The address to receive the assets
     * @return total rETH gained by the vault that is deposited into EigenLayer
     */
    function deposit(
        uint256 assets,
        address receiver
    )
        external
        payable
        virtual
        override
        nonReentrant
        onlyLM
        returns (uint256 rETH)
    {
        require(msg.value > 0 || assets > 0, "deposit: Invalid deposit amount");
        if (totalSupply() > 0 && _shares() == 0) {
            // an undelegation is underway
            revert("deposit: undelegation in progress");
        }

        // Send native eth and rETH to the rocket pool vault
        rETH = _deposit(assets, receiver);

        _depositIntoStrategy(rETH);
        emit Deposit(msg.sender, receiver, rETH);
    }

    /*
     * @notice Queue a withdrawal
     * @param ratio The amount of shares to withdraw (Note that ratio is 1e18 scaled)
     * @param receiver The address to receive the assets
     * @param owner The address of the owner
     * @return index The index of the withdrawal
     * @return cliff The time the withdrawal will be processed
     */
    function queueWithdraw(
        uint256 ratio,
        address receiver,
        address owner
    )
        external
        virtual
        override(RocketPoolVault)
        onlyLM
        returns (uint256 index, uint256 cliff)
    {
        if (totalSupply() > 0 && _shares() == 0) {
            // an undelegation is underway
            revert("queueWithdraw: undelegation in progress");
        }

        if (ratio == 0) {
            return (0, 0);
        }
        // burn from total assets for accountancy (next deposit will be kept track of total assets)
        uint256 assetsToBurn = (ratio * totalSupply()) / SCALE;
        _burn(msg.sender, assetsToBurn);

        IDelegationManagerTypes.QueuedWithdrawalParams
            memory queuedWithdrawalParam = IDelegationManagerTypes
                .QueuedWithdrawalParams({
                    strategies: new IStrategy[](1),
                    depositShares: new uint256[](1),
                    __deprecated_withdrawer: address(this)
                });

        queuedWithdrawalParam.strategies[0] = IStrategy(strategy);

        cliff = block.number + IDelegationManager(delegationManager).minWithdrawalDelayBlocks();

        // Calculate the shares to unstake, based on total shares in the vault
        // User wants to withdraw 10% of the total shares, or 100 shares
        // Shares in the vault = 1000
        // Shares to unstake = 1000 * 100 / 1000 = 100
        queuedWithdrawalParam.depositShares[0] = (ratio * _shares()) / SCALE; // the ratio to total shares from EigenLayer in this strategy
        // need to compute Withdrawal so we obtain the same withdrawalRoot afterwards
        IDelegationManagerTypes.Withdrawal
            memory withdrawalRequest = IDelegationManagerTypes.Withdrawal({
                staker: address(this),
                delegatedTo: IDelegationManager(delegationManager).delegatedTo(
                    address(this)
                ),
                withdrawer: address(this),
                nonce: IDelegationManager(delegationManager)
                    .cumulativeWithdrawalsQueued(address(this)),
                startBlock: uint32(block.number),
                strategies: queuedWithdrawalParam.strategies,
                scaledShares: queuedWithdrawalParam.depositShares
            });

        IDelegationManager.QueuedWithdrawalParams[]
            memory queuedWithdrawalParams = new IDelegationManager.QueuedWithdrawalParams[](
                1
            );

        queuedWithdrawalParams[0] = queuedWithdrawalParam;
        IDelegationManager(delegationManager).queueWithdrawals(
            queuedWithdrawalParams
        );

        Queue memory queue = Queue({
            amount: queuedWithdrawalParam.depositShares[0], // number of rETH shares from eigenlayer -> will be transformed to rETH and then to ETH when completed
            receiver: receiver,
            owner: owner,
            cliff: cliff,
            processed: false,
            withdrawalRequest: withdrawalRequest,
            asset: _underlying
        });

        // increase nonce
        nonce++;
        index = nonce;
        withdrawQueue[index] = queue;

        emit QueueWithdraw(
            msg.sender,
            queuedWithdrawalParam.depositShares[0],
            receiver,
            owner,
            cliff,
            index
        );
    }

    /*
     * @notice Withdraw assets from the vault
     * @param index The index of the withdrawal
     * @return assets The amount of assets to withdraw
     */
    function withdraw(
        uint256 index
    )
        external
        virtual
        override(RocketPoolVault)
        nonReentrant
        onlyLM
        returns (uint256 assets)
    {
        Queue memory _withdrawQueue = withdrawQueue[index];

        // check if the cliff has passed
        require(
            _withdrawQueue.cliff < block.number,
            "withdraw: Cliff not reached"
        );
        require(
            !_withdrawQueue.processed,
            "withdraw: Request already processed"
        );

        // rETH before unstaking
        uint256 assetsBefore = IERC20(_underlying).balanceOf(address(this));

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IStrategy(strategy).underlyingToken();

        IDelegationManager(delegationManager).completeQueuedWithdrawal(
            _withdrawQueue.withdrawalRequest,
            tokens,
            true
        );

        // rETH after unstaking
        uint256 assetsAfter = IERC20(_underlying).balanceOf(address(this));
        uint256 delta = assetsAfter - assetsBefore;

        // Trade shares for rETH and back to ETH
        assets = _convertToAssets(delta);

        withdrawQueue[index].processed = true;

        // do native eth transfer
        (bool sent, bytes memory data) = payable(_withdrawQueue.receiver).call{value: assets}("");
        require(sent, "Failed to send Ether");

        emit Withdraw(msg.sender, assets);
    }

    function setOperator(
        address operator,
        bytes calldata signature,
        uint256 expiry,
        bytes32 salt
    ) external onlyRole(DEFAULT_ADMIN_ROLE){
        // call delgateTo on the delegation manager
        ISignatureUtilsMixinTypes.SignatureWithExpiry memory sig = ISignatureUtilsMixinTypes
            .SignatureWithExpiry(signature, expiry);
        IDelegationManager(delegationManager).delegateTo(operator, sig, salt);
        emit NewOperatorSet(operator);
    }

    /**
     * @dev Unset the operator for the RewardsCoordinator - this remove all shares and queue withdrawal
     * @notice the operator may also trigger in EigenLayer to undelegate itself
     */
    function unsetOperator() external onlyRole(DEFAULT_ADMIN_ROLE) returns (bytes32[] memory){
        bytes32[] memory withdrawalRoots = IDelegationManager(delegationManager).undelegate(address(this));
        require(withdrawalRoots.length > 0, "unsetOperator: no withdrawal was queued");
        emit NewOperatorSet(address(0));
        emit QueueWithdrawalRoots(withdrawalRoots);
        return withdrawalRoots;
    }

    /**
     * @dev Claim rewards from the RewardsCoordinator
     * @param withdrawalRequest Withdrawal The claim to process
     * @notice This function is open because we want to allow anyone to call claim rewards
     * @notice This should only be possible when totalSupply > 0 and the vault has shares == 0 in eigenlayer
     */
    function claimWithdrawalRootsFromUnsetOperator (
        IDelegationManager.Withdrawal[] calldata withdrawalRequest
    )
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(totalSupply() > 0 && _shares() == 0, "shares: not minted");
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(_underlying);
        bytes32[] memory withdrawalRoots = new bytes32[](withdrawalRequest.length);
        for (uint256 i = 0; i < withdrawalRequest.length; i++) {
            bytes32 withdrawalRoot = IDelegationManager(delegationManager).calculateWithdrawalRoot(withdrawalRequest[i]);
            // set the receive as tokens to false to re-stake them
            IDelegationManager(delegationManager).completeQueuedWithdrawal(
                withdrawalRequest[i],
                tokens,
                false
            );
            withdrawalRoots[i] = withdrawalRoot;
        }
        emit ClaimWithdrawalRoots(withdrawalRoots);
    }


    /**
     * @dev Claim rewards from the RewardsCoordinator
     * @param _claim RewardsMerkleClaim The claim to process
     * @notice This function is open because we want to allow anyone to call claim rewards
     */
    function claimRewards(
        IRewardsCoordinatorTypes.RewardsMerkleClaim calldata _claim
    ) external {
        _claimReward(_claim);
    }

    /**
     * @dev Claim multiple rewards from the RewardsCoordinator
     * @param _claims The claims to process
     * @notice This function is open because we want to allow anyone to call claim rewards
     */
    function claimMultipleRewards(
        IRewardsCoordinatorTypes.RewardsMerkleClaim[] calldata _claims
    ) external {
        _claimMultipleRewards(_claims);
    }
    /**
     * @dev Deposit underlying asset into the vault
     * @param amount The amount to deposit
     * @notice This function is onlyOwner because we don't want to expose the ability to deposit underlying asset
     */
    function addUnderlyingAndDepositToEigen(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(_underlying).safeTransferFrom(msg.sender, address(this), amount);
        _depositUnderlying(amount);
    }
    /**
     * @dev Add to the underlying asset by an owner existing rETH in the vault
     * @param amount The amount to add
     * @notice This function is onlyOwner because we don't want to expose the ability to add to the underlying asset
     */
    function depositUnderlyingToEigen(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _depositUnderlying(amount);
    }

    /**
     * @dev Add rewards to the underlying asset
     * @param tokens The token to swap
     * @param amounts The amount to swap
     * @notice This function is onlyOwner because we don't want to expose the ability to swap tokens
     */
    function addRewardsToUnderlying(
        IERC20[] calldata tokens,
        bytes[] calldata paths,
        uint256[] calldata amounts,
        uint256[] calldata amountsOutMin,
        uint24[] calldata fees
    ) external onlyRole(CLAIMER_ROLE) {
        require(
            tokens.length == amounts.length
            && tokens.length == fees.length
            && tokens.length == amountsOutMin.length
            && tokens.length == paths.length,
            "addRewardsToUnderlying: Invalid input"
        );
        for (uint256 i = 0; i < tokens.length; i++) {
            _addRewardsToUnderlying(tokens[i], paths[i], amounts[i], amountsOutMin[i]);
        }
    }

    /**
     * @dev Sweep ERC20 tokens from the contract
     * @param tokens The tokens to sweep
     * @notice This function is onlyOwner because we don't want to expose the ability to sweep tokens
     */
    function sweepERC20Tokens(address[] calldata tokens) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < tokens.length; i++) {
            require (tokens[i] != address(_underlying), "sweepERC20Tokens: Cannot sweep underlying asset");
            // require (tokens[i] != address(_underlying));
            IERC20 token = IERC20(tokens[i]);
            IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
        }
    }

    function getClaim(uint256 _index)
    external
    view
    returns (
        uint32 rootIndex,
        uint32 earnerIndex,
        bytes memory earnerTreeProof,
        address earner,
        bytes32 earnerTokenRoot,
        uint32[] memory tokenIndices,
        bytes[] memory tokenTreeProofs,
        address[] memory tokens,
        uint256[] memory cumulativeEarnings
    )
    {
        IRewardsCoordinatorTypes.RewardsMerkleClaim memory claim = claims[_index];
        rootIndex = claim.rootIndex;
        earnerIndex = claim.earnerIndex;
        earnerTreeProof = claim.earnerTreeProof;
        earner = claim.earnerLeaf.earner;
        earnerTokenRoot = claim.earnerLeaf.earnerTokenRoot;
        tokenIndices = claim.tokenIndices;
        tokenTreeProofs = claim.tokenTreeProofs;

        uint256 len = claim.tokenLeaves.length;
        tokens = new address[](len);
        cumulativeEarnings = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            tokens[i] = address(claim.tokenLeaves[i].token);
            cumulativeEarnings[i] = claim.tokenLeaves[i].cumulativeEarnings;
        }
    }

    // Internal functions

    function _claimMultipleRewards(
        IRewardsCoordinatorTypes.RewardsMerkleClaim[] calldata _claims
    ) internal {
        // the reason we do it is because we want to compute the amount claimed which is diff between
        // balance before and after the claim because in the merkle is the cumulative and we might
        // have claimed before
        for (uint256 i = 0; i < _claims.length; i++) {
            _claimReward(_claims[i]);
        }
    }

    /**
     * @dev Claim rewards from the RewardsCoordinator
     * @param _claim The claim to process
     */
    function _claimReward(
        IRewardsCoordinatorTypes.RewardsMerkleClaim calldata _claim
    ) internal {
        rewardsCoordinator.processClaim(_claim, address(this));
        claims.push(_claim);
        emit RewardsClaimed();
    }

    function _addRewardsToUnderlying(IERC20 token, bytes calldata _path, uint256 amount, uint256 amountOutMin) internal {
        token.approve(_univ3router, amount);
        uint256 swapped = ISwapRouter(_uniV3Router)._swapWithMultipleHops(_path, address(this), amount, amountOutMin);
        if (swapped > 0) {
            _depositUnderlying(swapped);
        }
        emit TokensSwapped(address(token), _underlying, swapped);
    }
    /**
     * @dev deposit into strategy, internal function, with minting new erc20 tokens to keep track of newly added
     * rETH to the strategy that increased the number of shares
     */
    function _depositUnderlying (uint256 amount) internal {
        _depositIntoStrategy(amount);
        _mint(liquidityManager, amount);
    }

    function _depositIntoStrategy(uint256 amount) internal {
        // Deposit all rETH into the strategy
        IStrategyManager(strategyManager).depositIntoStrategy(
            strategy,
            _underlying,
            amount
        );
    }

    function _convertToAssets(uint256 amount) internal returns (uint256) {
        // remove the users ETH balance
        uint256 valueInEth = _oracle.getValueInEth(_underlying);
        uint256 idealAmount = (amount * valueInEth) / SCALE;

        // Get the current balance of this contract in ETH
        uint256 balanceBefore = address(this).balance;

        IERC20(_underlying).safeIncreaseAllowance(_router, amount);

        // swap rETH to ETH
        IRocketPoolRouter(_router).swapFrom(
            uniswapPortion,
            balancerPortion,
            (idealAmount * 997) / 1000, // 0.3% slippage
            (idealAmount * 1000) / 900,
            amount
        );

        uint256 balanceAfter = address(this).balance;
        if (balanceAfter == balanceBefore) {
            return 0;
        }
        return balanceAfter - balanceBefore;
    }

    // VIEW FUNCTIONS internal
    function _shares() private view returns (uint256) {
        return IStrategy(strategy).shares(address(this));
    }

    /**
     * @dev For EigenLayer we take total assets from underlying assets from eigen including slashes
     * and excluding queue withdrawals from EigenLayer
     */
    function _totalAssets() internal view override returns (uint256) {
        return IStrategy(strategy).userUnderlying(address(this));
    }

    function _virtualBalance() internal virtual override returns (uint256) {
        uint256 assets = _totalAssets();
        uint256 ethValue = _oracle.getValueInEth(_underlying);
        return (assets * ethValue) / SCALE;
    }
}
