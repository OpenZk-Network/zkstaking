import { ethers, upgrades } from "hardhat";
import { EventLog, ZeroAddress } from "ethers";
import { loadFixture, setBalance, impersonateAccount, stopImpersonatingAccount, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { hexZeroPad } from "@ethersproject/bytes";
import { ERC20, IDelegationManager } from "../typechain-types";
import WithdrawalStruct = IDelegationManager.WithdrawalStruct;
import { IRewardsCoordinatorTypes } from "../typechain-types/contracts/core/EigenLayerRETHVault";
import RewardsMerkleClaimStruct = IRewardsCoordinatorTypes.RewardsMerkleClaimStruct;
import WithdrawalStruct = IDelegationManager.WithdrawalStruct;

describe("EigenLayerRETHVault", () => {
	const rETHAddress = "0xae78736Cd615f374D3085123A210448E74Fc6393";
	const strategyAddress = "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2";

	const deployFixtures = async () => {
		const [owner, modifier, upgrader, lm, user1] = await ethers.getSigners();

		const underlying = await (await ethers.getContractFactory("MockERC20")).deploy("OZ ETH", "ozETH");
		// console.log("underlying", underlying.target);

		const oracle = await (await ethers.getContractFactory("MockOracle")).deploy();
		const uniswapOracle = await (await ethers.getContractFactory("UniswapOracle")).deploy(500);
		const uniswapRouter = await ethers.getContractAt("ISwapRouter", "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45");
		const mockRewardsCoordinator = await (await ethers.getContractFactory("MockRewardsCoordinator")).deploy();
		const eigenLayerVault = await upgrades.deployProxy(await ethers.getContractFactory("EigenLayerRETHVault"), [500, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
			kind: "uups",
			constructorArgs: [oracle.target, lm.address, uniswapRouter.target, mockRewardsCoordinator.target]
		});
		await eigenLayerVault.waitForDeployment();

		const eigenLayerUniswap = await upgrades.deployProxy(await ethers.getContractFactory("EigenLayerRETHVault"), [3000, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
			kind: "uups",
			constructorArgs: [oracle.target, lm.address, uniswapRouter.target, mockRewardsCoordinator.target]
		});

		return {
			owner,
			user1,
			modifier,
			eigenLayerVault,
			underlying,
			uniswapOracle,
			lm,
			eigenLayerUniswap,
			mockRewardsCoordinator
		};
	};

	describe("setOperator", () => {
		const operator = "0xDcAE4FAf7C7d0f4A78abe147244c6e9d60cFD202";
		const signature = ethers.hexlify(ethers.toUtf8Bytes("dummy signature"));
		const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now.
		const salt = hexZeroPad("0x01", 32);
		const delegationManagerAddress = "0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A";

		it("Should revert when non-admin attempts to set operator", async () => {
			const { eigenLayerVault, user1 } = await loadFixture(deployFixtures);

			await expect(eigenLayerVault.connect(user1).setOperator(operator, signature, expiry, salt)).to.be.revertedWithCustomError(
				eigenLayerVault,
				"AccessControlUnauthorizedAccount"
			);
		});

		it("Should set operator and forward parameters to the delegation manager", async () => {
			const { eigenLayerVault, owner } = await loadFixture(deployFixtures);
			const dm = await ethers.getContractAt("IDelegationManager", delegationManagerAddress);
			expect(await dm.isDelegated(eigenLayerVault.target)).to.be.false;
			await expect(eigenLayerVault.connect(owner).setOperator(operator, signature, expiry, salt))
				.to.emit(eigenLayerVault, "NewOperatorSet")
				.withArgs(operator);

			expect(await dm.isDelegated(eigenLayerVault.target)).to.be.true;
		});
	});

	describe("unsetOperator", () => {
		const operator = "0xDcAE4FAf7C7d0f4A78abe147244c6e9d60cFD202";
		const signature = ethers.hexlify(ethers.toUtf8Bytes("dummy signature"));
		const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now.
		const salt = hexZeroPad("0x01", 32);
		const delegationManagerAddress = "0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A";

		it("Should revert when non-admin attempts to unset operator", async () => {
			const { eigenLayerVault, user1 } = await loadFixture(deployFixtures);

			await expect(eigenLayerVault.connect(user1).unsetOperator()).to.be.revertedWithCustomError(eigenLayerVault, "AccessControlUnauthorizedAccount");
		});

		it("Should fail when unsetting missing operator", async () => {
			const { eigenLayerVault, owner, user1 } = await loadFixture(deployFixtures);
			const dm = await ethers.getContractAt("IDelegationManager", delegationManagerAddress);
			await expect(eigenLayerVault.connect(owner).unsetOperator()).to.be.revertedWithCustomError(dm, "NotActivelyDelegated()");
		});

		it("Should fail when no withdrawal queued", async () => {
			const { eigenLayerVault, owner, user1 } = await loadFixture(deployFixtures);

			await eigenLayerVault.connect(owner).setOperator(operator, signature, expiry, salt);
			await expect(eigenLayerVault.connect(owner).unsetOperator()).to.be.revertedWith("unsetOperator: no withdrawal was queued");
		});

		it("Should undelegate operator + claimWithdrawalRootsFromUnsetOperator", async () => {
			const rETHAddress = "0xae78736cd615f374d3085123a210448e74fc6393";
			const { eigenLayerVault, owner, lm, user1 } = await loadFixture(deployFixtures);
			const rETH = await ethers.getContractAt("ERC20", rETHAddress);
			await eigenLayerVault.connect(owner).setOperator(operator, signature, expiry, salt);

			// send rETH to owner
			const addressWithRETH = "0xE3a4E6C8aa24Eb41c255429B20eD1F63686180F9";
			await setBalance(addressWithRETH, ethers.parseEther("10"));
			await impersonateAccount(addressWithRETH);
			const impersonatedSigner = await ethers.getSigner(addressWithRETH);
			await rETH.connect(impersonatedSigner).transfer(owner.address, ethers.parseEther("1"));
			await stopImpersonatingAccount(addressWithRETH);

			// deposit rETH into the vault and mint tokens to LM
			const rETHBalance = await rETH.balanceOf(owner.address);
			console.log("Owner rETH balance", rETHBalance);
			await rETH.approve(eigenLayerVault.target, rETHBalance);
			await eigenLayerVault.connect(owner).addUnderlyingAndDepositToEigen(rETHBalance);
			expect(await eigenLayerVault.balanceOf(lm.address)).to.equal(rETHBalance);
			const rETHStrategy = await ethers.getContractAt("IStrategy", "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2");
			expect(await rETHStrategy.totalShares()).to.be.greaterThan(0);

			const strategyContract = await ethers.getContractAt("IStrategy", strategyAddress);
			const initialShares = await strategyContract.shares(eigenLayerVault.target);

			// queue withdrawal
			await expect(eigenLayerVault.connect(lm).queueWithdraw(ethers.parseEther("0.5"), user1.address, eigenLayerVault.target)).to.emit(eigenLayerVault, "QueueWithdraw");

			// fetch withdrawalRoot
			const withdrawalQueue = await eigenLayerVault.withdrawQueue(1);
			expect(withdrawalQueue.length).to.equal(7);
			const withdrawalRequest = withdrawalQueue[5];

			const currentBlock = await ethers.provider.getBlockNumber();
			const dm = await ethers.getContractAt("IDelegationManager", delegationManagerAddress);
			const delegatedTo = await dm.delegatedTo(eigenLayerVault.target);
			expect(delegatedTo).to.equal(operator);

			// create parameter for claimWithdrawalRootsFromUnsetOperator
			const withdrawalRequestParameter: WithdrawalStruct = {
				staker: eigenLayerVault.target,
				delegatedTo: delegatedTo,
				withdrawer: eigenLayerVault.target,
				nonce: 0,
				startBlock: currentBlock,
				strategies: [strategyAddress],
				scaledShares: [initialShares / BigInt(2)]
			};

			expect(withdrawalRequest[0]).to.equal(withdrawalRequestParameter.staker);
			expect(withdrawalRequest[1]).to.equal(withdrawalRequestParameter.delegatedTo);
			expect(withdrawalRequest[2]).to.equal(withdrawalRequestParameter.withdrawer);
			expect(withdrawalRequest[3]).to.equal(withdrawalRequestParameter.nonce);
			expect(withdrawalRequest[4]).to.equal(withdrawalRequestParameter.startBlock);
			expect(withdrawalRequest[5][0]).to.equal(withdrawalRequestParameter.strategies[0]);
			expect(withdrawalRequest[6][0]).to.equal(withdrawalRequestParameter.scaledShares[0]);

			const delegatebleShares = await dm.getDepositedShares(eigenLayerVault.target);
			const expectedWithdrawalRoot = await dm.calculateWithdrawalRoot({
				staker: withdrawalRequest[0],
				delegatedTo: withdrawalRequest[1],
				withdrawer: withdrawalRequest[2],
				nonce: await dm.cumulativeWithdrawalsQueued(eigenLayerVault.target),
				startBlock: 1 + (await ethers.provider.getBlockNumber()),
				strategies: [...withdrawalRequest[5]],
				scaledShares: [...delegatebleShares[1]]
			} as any);

			// unset operator
			await expect(eigenLayerVault.connect(owner).unsetOperator())
				.to.emit(eigenLayerVault, "NewOperatorSet")
				.withArgs(ZeroAddress)
				.to.emit(eigenLayerVault, "QueueWithdrawalRoots")
				.withArgs([expectedWithdrawalRoot]);

			const finalShares = await strategyContract.shares(eigenLayerVault.target);
			expect(finalShares).to.equal(0);

			// call claimWithdrawalRootsFromUnsetOperator
			await expect(eigenLayerVault.claimWithdrawalRootsFromUnsetOperator([withdrawalRequestParameter])).to.be.revertedWithCustomError(dm, "WithdrawalDelayNotElapsed()");
			const minBlockToMine = await dm.minWithdrawalDelayBlocks()

			await mine(minBlockToMine, { interval: 13 });

			const expectedWithdrawalRoot2 = await dm.calculateWithdrawalRoot(withdrawalRequestParameter);
			await expect(eigenLayerVault.claimWithdrawalRootsFromUnsetOperator([withdrawalRequestParameter]))
				.to.emit(eigenLayerVault, "ClaimWithdrawalRoots")
				.withArgs([expectedWithdrawalRoot2]);

			const finalFinalShares = await strategyContract.shares(eigenLayerVault.target);
			expect(finalFinalShares).to.be.greaterThan(0);
		});

		describe("claimWithdrawalRootsFromUnsetOperator", () => {
			const mockWithdrawalRequest = [
				{
					staker: ZeroAddress,
					delegatedTo: ZeroAddress,
					withdrawer: ZeroAddress,
					nonce: 0,
					startBlock: 0,
					strategies: [ZeroAddress],
					scaledShares: [ethers.parseEther("1")]
				}
			];

			it("Should only be called by admin", async () => {
				const { eigenLayerVault, user1 } = await loadFixture(deployFixtures);
				await expect(eigenLayerVault.connect(user1).claimWithdrawalRootsFromUnsetOperator(mockWithdrawalRequest)).to.be.revertedWithCustomError(
					eigenLayerVault,
					"AccessControlUnauthorizedAccount"
				);
			});
		});
	});

	describe("addRewardsToUnderlying", () => {
		const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
		const amountIn = ethers.parseEther("0.1");
		const feeTier = 3000; // typical Uniswap V3 fee tier

		it("Should fail for non admin", async () => {
			const { eigenLayerUniswap, user1 } = await loadFixture(deployFixtures);
			await expect(eigenLayerUniswap.connect(user1).addRewardsToUnderlying([wethAddress], [], [amountIn], [0], [feeTier])).to.be.revertedWithCustomError(
				eigenLayerUniswap,
				"AccessControlUnauthorizedAccount"
			);
		});

		it("Should fail for invalid inputs", async () => {
			const { eigenLayerUniswap } = await loadFixture(deployFixtures);
			await expect(eigenLayerUniswap.addRewardsToUnderlying([wethAddress], [], [amountIn], [0], [])).to.be.revertedWith("addRewardsToUnderlying: Invalid input");
		});

		it("should successfully swap WETH rewards into the underlying token", async () => {
			const { eigenLayerUniswap, owner, lm } = await loadFixture(deployFixtures);

			// --- Simulate receiving rewards in WETH ---
			// Get a handle on the WETH contract (using a minimal ABI)
			const wethAbi = ["function deposit() external payable", "function balanceOf(address) external view returns (uint256)"];
			const weth = await ethers.getContractAt(wethAbi, wethAddress);
			// Deposit ETH to get WETH (simulate converting ETH to WETH)
			await (await weth.deposit({ value: amountIn })).wait();

			// Transfer the minted WETH to the vault (simulate rewards)
			const erc20Abi = ["function transfer(address to, uint256 amount) external returns (bool)", "function balanceOf(address account) external view returns (uint256)"];
			const wethToken = await ethers.getContractAt(erc20Abi, wethAddress);
			await (await wethToken.transfer(eigenLayerUniswap.target, amountIn)).wait();

			// Verify that the vault received the reward tokens.
			const vaultWethBalance = await wethToken.balanceOf(eigenLayerUniswap.target);
			expect(vaultWethBalance).to.equal(amountIn);

			const strategyContract = await ethers.getContractAt("IStrategy", strategyAddress);
			const initialShares = await strategyContract.shares(eigenLayerUniswap.target);
			expect(initialShares).to.equal(0);

			const swapPath = ethers.solidityPacked(["address", "uint24", "address"], [wethAddress, feeTier, rETHAddress]);

			// --- Capture the event and verify the underlying token’s balance ---
			const tx = await eigenLayerUniswap.connect(owner).addRewardsToUnderlying([wethAddress], [swapPath], [amountIn], [0], [feeTier]);
			let args: any[];
			const receipt = await tx.wait();
			// for (const log: EventLog of receipt.logs) {
			//   if (log.eventName === 'TokensSwapped') {
			//     args = log.args;
			//   }
			// }
			// expect(args.length).to.equal(3);
			// expect(args[0]).to.equal(wethAddress);
			// expect(args[1]).to.equal(rETHAddress);
			// expect(args[2]).to.be.greaterThan(0)

			// const underlying = await ethers.getContractAt('ERC20', rETHAddress);
			// const vaultUnderlyingBalance = await underlying.balanceOf(eigenLayerUniswap.target);
			// expect(vaultUnderlyingBalance).to.equal(0);

			// const finalShares = await strategyContract.shares(eigenLayerUniswap.target);
			// expect(finalShares).to.be.greaterThan(0);

			// const mintedTokens = await eigenLayerUniswap.balanceOf(lm.address);
			// expect(mintedTokens).to.equal(args[2]);
		});
	});

	describe("claimRewards", () => {
		it("Claim rewards", async () => {
			const { eigenLayerUniswap, mockRewardsCoordinator } = await loadFixture(deployFixtures);

			// https://etherscan.io/tx/0x773e896f9196dcb7d5c9975985bbf05d5f9df8ada76a6db135cec1ea846d20f1
			const merkleClaimStruct: RewardsMerkleClaimStruct = {
				rootIndex: 26,
				earnerIndex: 89006,
				earnerTreeProof:
					"0xdef5db6a14355365961a6087800dd7ae9a06517d169d7a68b64aa55c3a21f28f681add58f54b9dc0e5e0fc6e8bd8fca6cefdcef5c9f707326a0aba0caddf831bb5c443a4942e9f7ead7bfcde6e821dff5cd9711959a2481ca3f6dadf7ef2a682f129e4549edb909eed9dd64a0023a066682e2aeb2e0903b3c37a9d07d9d22e6fe7ee04e0e8e990bf4bd4254293ce2d23178b19cf855cd784d978375aa267b43332379c23acb499821cb13dad2d86148c01563712b888730d26767afd0dd6ce3075f677f0a16acc82a382de972cfde71e9aef16c7b1c495e4cf4bc588f89543818753d831a9ec26d483bb94cd0a7a7a7b089f831f93389591faa957065546821810b7eaab0b23bbed6a2e83fcd2fa1d708dfe348d8888707982285a5835e5eac3e9276146287a933ef7dcf0420a9995ff6a8eded0e3af515e319f7f0b1035e9e6d94ef77d271fb12be18c73070730656d5f50027919426d653f9986526c2f03457653424fce3728beddef2e76a8198d96590b2a8745c513cc134a1e7e932c35a061e00eb46db70ea3df7631180c1c192b45d0f469ed98fcc6b6c50844d9c62363b418ffeadcf0e39781ba840c9f35578ffb1206191cc24ebca249de44edef7e42bc5ff78b50e32e2b39410dd5353e1c8dfe0330040159ddac87c070921d50ccce137b510f913633ef3c40cfc72be613e4819419c7ba649936e1ad7fbe144508d6d813f0beb1ab8025b7058d08adf060641496dfa4de5185713aab8a5ccdccd9b08afd67e67f6a438b9f816f3c364e3ceb9a5044adec2a6777d1e0c261e915d484",
				earnerLeaf: {
					earner: "0x9112e80f777Da32cdA97e4eBAA512feE5D3DE203",
					earnerTokenRoot: "0x4b4d98c4ceb77f16942f503a4f04c5698f180f0efa5d0ded82b2fb5338fa297e"
				},
				tokenIndices: [2, 1, 0],
				tokenTreeProofs: [
					"0x00000000000000000000000000000000000000000000000000000000000000003a2e033eee5f03ad779cb47f81f13bdfe02bc88ca13636254be67341f81fe663",
					"0xf7e9267da243f9038b16c02aa313f3bfb10cebe20a0f0cbddda1aaffb77198e2a6e6eb7d00e69ecd61e7a385a4a00645297266ced26b8eb0e048277d186876c6",
					"0x9d17244bc78210a5cdc86176651f32f815687a476264e1549c267cae07b56b17a6e6eb7d00e69ecd61e7a385a4a00645297266ced26b8eb0e048277d186876c6"
				],
				tokenLeaves: [
					{
						token: "",
						cumulativeEarnings: "615801865396601670141"
					},
					{
						token: "",
						cumulativeEarnings: "791942823105106"
					},
					{
						token: "",
						cumulativeEarnings: "4972337038957635000"
					}
				]
			};

			// fund rewards coordinator with tokens
			// create mock erc 20 first
			const erc20TokenContracts: ERC20[] = [];
			for (let i = 0; i < merkleClaimStruct.tokenLeaves.length; i++) {
				const mockERC20 = await (await ethers.getContractFactory("MockERC20")).deploy("name", "symbol");
				await mockERC20.mint(mockRewardsCoordinator.target, merkleClaimStruct.tokenLeaves[i].cumulativeEarnings);
				// overwrite tokenLeaves token address
				merkleClaimStruct.tokenLeaves[i].token = mockERC20.target;
				erc20TokenContracts.push(mockERC20);
			}

			await expect(eigenLayerUniswap.claimRewards(merkleClaimStruct)).to.emit(eigenLayerUniswap, "RewardsClaimed");

			expect(await erc20TokenContracts[0].balanceOf(eigenLayerUniswap.target)).to.equal(merkleClaimStruct.tokenLeaves[0].cumulativeEarnings);
			expect(await erc20TokenContracts[1].balanceOf(eigenLayerUniswap.target)).to.equal(merkleClaimStruct.tokenLeaves[1].cumulativeEarnings);
			expect(await erc20TokenContracts[2].balanceOf(eigenLayerUniswap.target)).to.equal(merkleClaimStruct.tokenLeaves[2].cumulativeEarnings);
			const claim = await eigenLayerUniswap.getClaim(0);
			expect(claim[0]).to.equal(merkleClaimStruct.rootIndex);
			expect(claim[1]).to.equal(merkleClaimStruct.earnerIndex);
			expect(claim[2]).to.equal(merkleClaimStruct.earnerTreeProof);
			expect(claim[3]).to.equal(merkleClaimStruct.earnerLeaf.earner);
			expect(claim[4]).to.equal(merkleClaimStruct.earnerLeaf.earnerTokenRoot);
			expect(claim[5]).to.deep.equal(merkleClaimStruct.tokenIndices.map((t) => BigInt(t)));
			expect(claim[6]).to.deep.equal(merkleClaimStruct.tokenTreeProofs);
			expect(claim[7]).to.deep.equal(merkleClaimStruct.tokenLeaves.map((t) => t.token));
			expect(claim[8]).to.deep.equal(merkleClaimStruct.tokenLeaves.map((t) => BigInt(t.cumulativeEarnings)));
		});
	});
});
