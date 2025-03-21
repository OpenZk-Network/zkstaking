import { expect } from "chai";
import { ethers } from "hardhat";
import { LiquidityManager, MockERC20, MockVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Unstake Function", () => {
	let liquidityManager: LiquidityManager;
	let mockVault: MockVault;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let underlying: MockERC20;

	beforeEach(async () => {
		[owner, user1] = await ethers.getSigners();

		// Deploy mock LP token
		const MockToken = await ethers.getContractFactory("MockERC20");
		underlying = await MockToken.deploy("ozETH", "ozETH");
		await underlying.waitForDeployment();

		const underlyingAddress = await underlying.getAddress();

		// Deploy LiquidityManager
		const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
		liquidityManager = await LiquidityManager.deploy(underlyingAddress, owner.address);
		await liquidityManager.waitForDeployment();

		// Deploy mock asset
		const MockAsset = await ethers.getContractFactory("MockERC20");
		const asset = await MockAsset.deploy("Staked ETH", "sETH");
		await asset.waitForDeployment();

		const assetAddress = await asset.getAddress();

		// Deploy mock vault
		const MockVault = await ethers.getContractFactory("MockVault");
		mockVault = await MockVault.deploy(assetAddress);
		await mockVault.waitForDeployment();

		// Add vault
		const MODIFIER_ROLE = await liquidityManager.MODIFIER_ROLE();
		await liquidityManager.grantRole(MODIFIER_ROLE, owner.address);
		await liquidityManager.addVault(await mockVault.getAddress(), 100);

		// Initial stake
		const stakeAmount = ethers.parseEther("1");
		expect(await liquidityManager.connect(user1).stake({ value: stakeAmount }))
			.to.emit(liquidityManager, "Staked")
			.withArgs(user1.address, stakeAmount);
	});

	it("Should start unstake queue full amount correctly", async () => {
		const initialBalance = await ethers.provider.getBalance(user1.address);
		expect(initialBalance).to.be.gt(0);
		const shares = await underlying.balanceOf(user1.address);

		const cliff = 1740291427n; // + 1 week
		await expect(liquidityManager.connect(user1).queueUnstake(shares))
			.to.emit(liquidityManager, "UnstakeQueued")
			.withArgs(user1.address, shares, cliff, 1);

		// const tx = await liquidityManager.connect(user1).queueUnstake(shares);
		// const receipt = await tx.wait();
		// const gasCost = receipt.gasUsed * receipt.gasPrice;

		const finalBalance = await ethers.provider.getBalance(user1.address);
		expect(finalBalance).to.be.gt(0);

		// Check user received correct ETH amount (accounting for gas)
		const expectedBalance = initialBalance; // + ethers.parseEther("1") - gasCost;
		expect(finalBalance).to.be.closeTo(expectedBalance, ethers.parseEther("1"));

		// Check shares were burned
		expect(await underlying.balanceOf(user1.address)).to.equal(0);

		// Ca
		await expect(liquidityManager.connect(user1).unstake(1)).to.be.revertedWith("unstake: Cliff not reached");

		await mine(72000, { interval: 13 });

		await expect(liquidityManager.connect(user1).unstake(1))
			.to.emit(liquidityManager, "Unstaked")
			.withArgs(user1.address, 1000000000000000000n, 1n);
	});

	// it("Should unstake partial amount correctly", async () => {
	// 	const shares = await underlying.balanceOf(user1.address);
	// 	const halfShares = shares / 2n;

	// 	await liquidityManager.connect(user1).unstake(halfShares);

	// 	// Check remaining shares
	// 	expect(await underlying.balanceOf(user1.address)).to.equal(halfShares);
	// });

	// it("Should handle small unstake amounts correctly", async () => {
	// 	const smallShares = ethers.parseEther("0.0001");
	// 	await liquidityManager.connect(user1).unstake(smallShares);

	// 	// Verify shares were deducted
	// 	const expectedRemaining = ethers.parseEther("1") - smallShares;
	// 	expect(await underlying.balanceOf(user1.address)).to.equal(expectedRemaining);
	// });

	// it("Should fail when unstaking more than balance", async () => {
	// 	const tooManyShares = ethers.parseEther("2");
	// 	await expect(liquidityManager.connect(user1).unstake(tooManyShares)).to.be.revertedWith("unstake: Insufficient balance");
	// });
});
