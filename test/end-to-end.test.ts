import { ethers, upgrades } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";

describe.skip("end-to-end", () => {
	const rETHAddress = "0xae78736cd615f374d3085123a210448e74fc6393";

	const deployFixtures = async () => {
		const [owner, modifier, upgrader, user1, user2] = await ethers.getSigners();

		const underlying = await (await ethers.getContractFactory("MockERC20")).deploy("OZ ETH", "ozETH");
		console.log("underlying", underlying.target);

		const liquidityManager = await (await ethers.getContractFactory("LiquidityManager")).deploy(underlying.target, owner.address);
		console.log("Deploy LiquidityManager: ", liquidityManager.target);

		await liquidityManager.connect(owner).grantRole(await liquidityManager.MODIFIER_ROLE(), modifier.address);

		const uniswapOracle = await (await ethers.getContractFactory("UniswapOracle")).deploy(500);
		const chainlinkOracle = await (await ethers.getContractFactory("ChainlinkOracle")).deploy("0x536218f9E9Eb48863970252233c8F271f554C2d0");
		const swapRouter = await ethers.getContractAt("ISwapRouter", "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45");
		const mockRewardsCoordinator = await (await ethers.getContractFactory("MockRewardsCoordinator")).deploy();
		const eigenLayerVault = await upgrades.deployProxy(await ethers.getContractFactory("EigenLayerRETHVault"), [500, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
			kind: "uups",
			constructorArgs: [chainlinkOracle.target, liquidityManager.target, swapRouter.target, mockRewardsCoordinator.target]
		});
		await eigenLayerVault.waitForDeployment();

		console.log("Deploy RocketPoolVault: ", eigenLayerVault.target);
		const rocketPoolVault = await upgrades.deployProxy(await ethers.getContractFactory("RocketPoolVault"), [500, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
			constructorArgs: [uniswapOracle.target, liquidityManager.target, swapRouter.target]
		});
		await rocketPoolVault.waitForDeployment();
		console.log("Deploy RocketPoolVault:", rocketPoolVault.target);

		console.log("Add vaults");
		await liquidityManager.connect(modifier).addVault(eigenLayerVault.target, 3);
		await liquidityManager.connect(modifier).addVault(rocketPoolVault.target, 7);

		return {
			owner,
			user1,
			user2,
			modifier,
			liquidityManager,
			eigenLayerVault,
			underlying,
			rocketPoolVault,
			uniswapOracle,
			chainlinkOracle
		};
	};

	describe("Liquidity manager", () => {
		it("Should handle double staking with proper allocations", async () => {
			const { liquidityManager, user1, user2, rocketPoolVault, eigenLayerVault, underlying, uniswapOracle, chainlinkOracle } = await loadFixture(deployFixtures);

			const stakeAmount = ethers.parseEther("80");

			const rETHPrice1 = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			console.log(`User1 stakes ${ethers.formatEther(stakeAmount)} ETH`);
			await expect(liquidityManager.connect(user1).stake({ value: stakeAmount }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user1.address, stakeAmount);

			const user1Shares = await underlying.balanceOf(user1.address);
			const vault1TotalAssets = await eigenLayerVault.totalAssets(); // rETH
			const vault2TotalAssets = await rocketPoolVault.totalAssets(); // rETH
			const totalSupply1 = await underlying.totalSupply();

			console.log(`User1 ozETH must equal total ozETH: ${ethers.formatEther(totalSupply1)}`);
			expect(user1Shares).to.equal(totalSupply1);
			console.log(`Total ozETH must equal stake amount: ${ethers.formatEther(stakeAmount)}`);
			expect(totalSupply1).to.equal(stakeAmount);

			console.log(`Vault total assets must be weighted`);
			expect((vault1TotalAssets * BigInt(100)) / (vault1TotalAssets + vault2TotalAssets)).to.be.closeTo(BigInt(30), 1);
			expect((vault2TotalAssets * BigInt(100)) / (vault1TotalAssets + vault2TotalAssets)).to.be.closeTo(BigInt(70), 1);

			const computedVault1Assets = (((stakeAmount * ethers.parseEther("1")) / rETHPrice1) * BigInt(30)) / BigInt(100);
			console.log(`Vault1 total assets must be 30% of stake amount converted in rETH: ${ethers.formatEther(computedVault1Assets)}`);
			expect(vault1TotalAssets).to.be.closeTo(computedVault1Assets, ethers.parseEther("0.1"));

			const computedVault2Assets = (((stakeAmount * ethers.parseEther("1")) / rETHPrice1) * BigInt(70)) / BigInt(100);
			console.log(`Vault2 total assets must be 70% of stake amount converted in rETH: ${ethers.formatEther(computedVault2Assets)}`);
			expect(vault2TotalAssets).to.be.closeTo(computedVault2Assets, ethers.parseEther("0.3"));

			const totalVP1 = await liquidityManager.virtualBalance.staticCall();
			const vault1VP1 = await eigenLayerVault.virtualBalance.staticCall();
			const vault2VP1 = await rocketPoolVault.virtualBalance.staticCall();
			console.log(`Liquidity manager VP must be sum of vault VP: ${ethers.formatEther(totalVP1)}`);
			expect(totalVP1).to.equal(vault1VP1 + vault2VP1);

			const rETHPrice2 = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			console.log("\n");
			console.log(`User2 stakes ${ethers.formatEther(stakeAmount)} ETH`);
			await expect(liquidityManager.connect(user2).stake({ value: stakeAmount }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user2.address, stakeAmount);

			const user2Shares = await underlying.balanceOf(user2.address);
			const user2SharesComputed = (stakeAmount * totalSupply1) / totalVP1;
			console.log(`User2 ozETH must be close to : ${ethers.formatEther(user2SharesComputed)}`);
			expect(user2Shares).to.be.closeTo(user2SharesComputed, ethers.parseEther("0.8")); // increased delta due to large ETH staked and price rETH price variations

			// rETH value increases after deposit in vault1, so vault2 receive less rETH than is should have => so vault2 weight deceases
			const vault1TotalAssets2 = await eigenLayerVault.totalAssets(); // rETH
			const vault2TotalAssets2 = await rocketPoolVault.totalAssets(); // rETH
			expect((vault1TotalAssets2 * BigInt(100)) / (vault1TotalAssets2 + vault2TotalAssets2)).to.be.closeTo(BigInt(30), 1);
			expect((vault2TotalAssets2 * BigInt(100)) / (vault1TotalAssets2 + vault2TotalAssets2)).to.be.closeTo(BigInt(70), 1);

			const computedVault1Assets2 = vault1TotalAssets + (((stakeAmount * ethers.parseEther("1")) / rETHPrice2) * BigInt(30)) / BigInt(100);
			console.log(`Vault1 total assets must = rETH from user1 + 30% of stake amount converted in rETH from user2: ${ethers.formatEther(computedVault1Assets2)}`);
			expect(vault1TotalAssets2).to.be.closeTo(computedVault1Assets2, ethers.parseEther("0.3"));

			const totalSupply2 = await underlying.totalSupply();
			console.log("Total ozETH must equal sum of user shares: ", ethers.formatEther(totalSupply2));
			expect(totalSupply2).to.equal(user1Shares + user2Shares);

			console.log("All vault tokens must be minted to LM");
			expect(await eigenLayerVault.totalSupply()).to.equal(await eigenLayerVault.balanceOf(liquidityManager.target));
			expect(await rocketPoolVault.totalSupply()).to.equal(await rocketPoolVault.balanceOf(liquidityManager.target));
		});

		it("Should allow user1 to stake 10 ETH and withdraw half of their shares", async () => {
			const { liquidityManager, eigenLayerVault, rocketPoolVault, user1, underlying, uniswapOracle, chainlinkOracle } = await loadFixture(deployFixtures);

			const stakeAmount = ethers.parseEther("10"); // 10 ETH
			const rETHPrice = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			const halfShares = stakeAmount / BigInt(2); // Half of the shares

			// Step 1: User1 stakes 10 ETH
			console.log("Step 1: User1 stakes 10 ETH");
			await expect(liquidityManager.connect(user1).stake({ value: stakeAmount }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user1.address, stakeAmount);

			// Check the user's share balance and total assets in the vault
			const userSharesAfterStake = await underlying.balanceOf(user1.address);
			const totalAssets = (await eigenLayerVault.totalAssets()) + (await rocketPoolVault.totalAssets());

			console.log("User shares after stake:", ethers.formatEther(userSharesAfterStake));
			console.log("Total assets in the vault after stake:", ethers.formatEther(totalAssets));

			expect(userSharesAfterStake).to.equal(stakeAmount);
			expect(totalAssets).to.be.closeTo((stakeAmount * ethers.parseEther("1")) / rETHPrice, ethers.parseEther("0.1"));

			// Step 2: User1 queues a withdrawal for half of their shares
			console.log("Step 2: User1 queues a withdrawal for half of their shares");
			let tx = await (await liquidityManager.connect(user1).queueUnstake(halfShares)).wait();
			const blockNumber = tx?.blockNumber;
			const timestamp = (await ethers.provider.getBlock(blockNumber || "latest"))?.timestamp;
			console.log(timestamp);
			await expect(tx)
				.to.emit(liquidityManager, "UnstakeQueued")
				.withArgs(user1.address, halfShares, BigInt(timestamp || 0) + (await liquidityManager._vesting_period()), 1);
			// .to.emit(eigenLayerVault, 'QueueWithdraw')
			// .withArgs(liquidityManager.target, BigInt(1339471476579367680), liquidityManager.target, liquidityManager.target, 10, 1);

			// Ensure the queued withdrawal exists with the correct amount and cliff
			const unstakeRequest = await liquidityManager.unstakeRequests(1);
			const block = await ethers.provider.getBlock("latest");

			const vestingPeriod = 10 * 24 * 60 * 60; // 10 days
			expect(unstakeRequest.shares).to.equal(halfShares);
			expect(unstakeRequest.account).to.equal(user1.address);
			expect(unstakeRequest.cliff).to.be.equal(block?.timestamp + vestingPeriod);
			// Try to unstake before cliff period
			await expect(liquidityManager.connect(user1).unstake(1)).to.be.revertedWith("unstake: Cliff not reached");

			// Step 3: Move forward in time to pass the cliff period
			console.log("Step 3: Move forward in time to pass the cliff period");
			await mine(72000, { interval: 13 });
			// set chainlink threshold
			await chainlinkOracle.setTimeThreashold(1000000000);

			// Step 4: User1 withdraws half of their shares
			console.log("Step 4: User1 withdraws half of their shares");
			const userEthBalanceBeforeWithdraw = await ethers.provider.getBalance(user1.address);

			await expect(liquidityManager.connect(user1).unstake(1)).to.emit(liquidityManager, "Unstaked");

			const userEthBalanceAfterWithdraw = await ethers.provider.getBalance(user1.address);
			const ethReceived = userEthBalanceAfterWithdraw - userEthBalanceBeforeWithdraw;
			console.log("ethReceived:", ethers.formatEther(ethReceived));

			// Verify that the user's ETH balance increased by the correct amount
			expect(ethReceived).to.be.closeTo(stakeAmount / BigInt(2), ethers.parseEther("0.01"));

			console.log("Step 5: Verify the remaining assets in the vaults and user's shares");
			const userSharesAfterWithdraw = await underlying.balanceOf(user1.address);
			console.log("User shares after withdraw: ", ethers.formatEther(userSharesAfterWithdraw));
			expect(userSharesAfterWithdraw).to.equal(halfShares);

			const vault1Balance = await eigenLayerVault.totalAssets();
			const vault2Balance = await rocketPoolVault.totalAssets();
			expect(vault1Balance + vault2Balance).to.be.closeTo((halfShares * ethers.parseEther("1")) / rETHPrice, ethers.parseEther("0.01"));
		});

		it("Should allow user1 to stake 10 ETH, user1 queue withdraw 5 ETH, user2 stake 10 ETH, user1 unstake", async () => {
			const { liquidityManager, eigenLayerVault, rocketPoolVault, user1, user2, underlying, uniswapOracle, chainlinkOracle } = await loadFixture(deployFixtures);

			const stakeAmount = ethers.parseEther("10");

			// Step 1: User1 stakes 10 ETH
			console.log("Step 1: User1 stakes 10 ETH");
			await expect(liquidityManager.connect(user1).stake({ value: stakeAmount }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user1.address, stakeAmount);

			const user1Shares = await underlying.balanceOf(user1.address);
			console.log("User1 shares: ", ethers.formatEther(user1Shares));
			expect(user1Shares).to.equal(stakeAmount);

			console.log("Step 2: User1 queues a withdrawal for half of their shares");
			// cliff
			const tx = await (await liquidityManager.connect(user1).queueUnstake(stakeAmount / BigInt(2))).wait();
			await expect(tx)
				.to.emit(liquidityManager, "UnstakeQueued")
				.withArgs(
					user1.address,
					stakeAmount / BigInt(2),
					BigInt((await ethers.provider.getBlock(tx?.blockNumber || "latest"))?.timestamp || 0) + (await liquidityManager._vesting_period()),
					1
				);

			const totalVP1 = await liquidityManager.virtualBalance.staticCall();
			const totalAssets = await underlying.totalSupply();
			console.log(`Total ozETH must be 5 after queue unstake: ${ethers.formatEther(totalAssets)}`);
			expect(totalAssets).to.be.equal(ethers.parseEther("5"));

			console.log("Step 3: User2 stakes 10 ETH");
			await expect(liquidityManager.connect(user2).stake({ value: stakeAmount }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user2.address, stakeAmount);
			const user2Shares = await underlying.balanceOf(user2.address);
			const user2SharesComputed = (stakeAmount * ethers.parseEther("5")) / totalVP1;
			console.log("User2 shares must be close to 5 ozETH");
			expect(user2Shares).to.be.closeTo(user2SharesComputed, ethers.parseEther("0.1"));

			console.log("Step 4: User1 unstake");
			await mine(72000, { interval: 13 });
			await chainlinkOracle.setTimeThreashold(1000000000);

			const userEthBalanceBeforeWithdraw = await ethers.provider.getBalance(user1.address);
			await expect(liquidityManager.connect(user1).unstake(1)).to.emit(liquidityManager, "Unstaked");

			const userEthBalanceAfterWithdraw = await ethers.provider.getBalance(user1.address);
			const ethReceived = userEthBalanceAfterWithdraw - userEthBalanceBeforeWithdraw;
			console.log("Received eth must be close to 5:", ethers.formatEther(ethReceived));
			expect(ethReceived).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.01"));
		});

		it("Multiple users stake 10 ETH", async () => {
			const { liquidityManager, underlying, uniswapOracle, chainlinkOracle } = await loadFixture(deployFixtures);

			const rEthPrice1 = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			console.log("rEthPrice1", rEthPrice1);
			const signers = await ethers.getSigners();
			const start = 5;
			const end = 15;
			const stakeAmount = ethers.parseEther("10");
			for (let i = start; i <= end; i++) {
				await liquidityManager.connect(signers[i]).stake({ value: stakeAmount });
			}
			const rEthPrice2 = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			console.log("rEthPrice2", rEthPrice2);
			expect(rEthPrice2).to.be.greaterThan(rEthPrice1);

			for (let i = start; i < end; i++) {
				const share1 = await underlying.balanceOf(signers[i].address);
				const share2 = await underlying.balanceOf(signers[i + 1].address);
				// expect(share2).to.be.lessThan(share1); // todo first users shouldn't have a bigger share?
			}

			console.log("User1 unstakes");
			const user1 = signers[start];
			const user1Shares = await underlying.balanceOf(user1.address);
			let tx = await (await liquidityManager.connect(signers[start]).queueUnstake(user1Shares)).wait();
			let timestamp = (await ethers.provider.getBlock(tx.blockNumber || "latest"))?.timestamp;
			await expect(tx)
				.to.emit(liquidityManager, "UnstakeQueued")
				.withArgs(user1.address, user1Shares, BigInt(timestamp || 0) + (await liquidityManager._vesting_period()), 1);

			await mine(72000, { interval: 13 });
			await chainlinkOracle.setTimeThreashold(1000000000);
			const userEthBalanceBeforeWithdraw = await ethers.provider.getBalance(user1.address);
			await expect(liquidityManager.connect(user1).unstake(1)).to.emit(liquidityManager, "Unstaked");

			const userEthBalanceAfterWithdraw = await ethers.provider.getBalance(user1.address);
			const ethReceived = userEthBalanceAfterWithdraw - userEthBalanceBeforeWithdraw;
			console.log("ethReceived:", ethers.formatEther(ethReceived));
			expect(ethReceived).to.be.closeTo(stakeAmount, ethers.parseEther("0.1"));
		});
	});

	describe("RocketPoolVault", () => {
		const deployVaults = async () => {
			const [lm, owner, upgrader, user1, user2] = await ethers.getSigners();
			const uniswapOracle = await (await ethers.getContractFactory("UniswapOracle")).deploy(500);
			const swapRouter = await (await ethers.getContractFactory("MockSwapRouter")).deploy();
			const rocketPoolVault = await upgrades.deployProxy(await ethers.getContractFactory("RocketPoolVault"), [500, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
				constructorArgs: [uniswapOracle.target, lm.address, swapRouter.target]
			});
			await rocketPoolVault.waitForDeployment();
			console.log("Deploy RocketPoolVault:", rocketPoolVault.target);

			return {
				lm,
				user1,
				user2,
				uniswapOracle,
				rocketPoolVault
			};
		};

		it("Deposit 10 ETH", async () => {
			await loadFixture(deployFixtures);
			const { lm, user1, user2, uniswapOracle, rocketPoolVault } = await loadFixture(deployVaults);

			const rEthPrice = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			const amount = ethers.parseEther("10");
			await rocketPoolVault.connect(lm).deposit(0, user1.address, { value: amount });
			const user1Assets = await rocketPoolVault.balanceOf(user1.address);
			expect(user1Assets).to.closeTo((amount * ethers.parseEther("1")) / rEthPrice, ethers.parseEther("0.1"));

			const rEthPrice2 = await uniswapOracle.getValueInEth.staticCall(rETHAddress);
			await rocketPoolVault.connect(lm).deposit(0, user2.address, { value: amount });
			const user2Assets = await rocketPoolVault.balanceOf(user2.address);
			const rETH = await ethers.getContractAt("MockERC20", rETHAddress);
			const totalReth = await rETH.balanceOf(rocketPoolVault.target);
			const shareValue = (user1Assets * ethers.parseEther("1")) / totalReth;

			expect(user2Assets).to.be.closeTo((amount * shareValue) / rEthPrice2, ethers.parseEther("0.01"));
		});
	});
});
