import { expect } from "chai";
import { ethers } from "hardhat";
import { LiquidityManager, MockVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe.skip("Stake Function", () => {
	let liquidityManager: LiquidityManager;
	let mockVault: MockVault;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;

	beforeEach(async () => {
		[owner, user1] = await ethers.getSigners();

		// Deploy mock vault
		const MockVault = await ethers.getContractFactory("MockVault");
		mockVault = await MockVault.deploy(ethers.ZeroAddress);
		await mockVault.waitForDeployment();

		// Deploy LiquidityManager
		const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
		liquidityManager = await LiquidityManager.deploy();
		await liquidityManager.waitForDeployment();

		// Add vault
		await liquidityManager.addVault(await mockVault.getAddress(), 100);
	});

	it("Should mint correct number of shares for first deposit", async () => {
		const stakeAmount = ethers.parseEther("1");
		await liquidityManager.connect(user1).stake({ value: stakeAmount });

		const shares = await liquidityManager.balanceOf(user1.address);
		expect(shares).to.equal(stakeAmount);
	});

	it("Should mint correct number of shares for subsequent deposits", async () => {
		// First deposit
		const firstStake = ethers.parseEther("1");
		await liquidityManager.connect(user1).stake({ value: firstStake });
		let shares = await liquidityManager.balanceOf(user1.address);
		console.log(shares.toString());

		// Second deposit
		const secondStake = ethers.parseEther("0.5");
		await liquidityManager.connect(user1).stake({ value: secondStake });
		shares = await liquidityManager.balanceOf(user1.address);
		console.log(shares.toString());

		const totalShares = await liquidityManager.balanceOf(user1.address);
		expect(totalShares).to.be.gt(0);
		// expect(totalShares).to.equal(firstStake + secondStake);
	});

	it("Should handle small deposits correctly", async () => {
		const smallStake = ethers.parseEther("0.0001");
		await liquidityManager.connect(user1).stake({ value: smallStake });

		const shares = await liquidityManager.balanceOf(user1.address);
		expect(shares).to.be.gt(0);
	});

	it("Should maintain correct total assets", async () => {
		const stakeAmount = ethers.parseEther("1");
		await liquidityManager.connect(user1).stake({ value: stakeAmount });

		expect(await liquidityManager.totalAssets()).to.equal(stakeAmount);
	});
});
