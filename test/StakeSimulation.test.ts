import { expect } from "chai";
import { ethers } from "hardhat";
import { LiquidityManager, MockVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe.skip("Stake Function", () => {
	let liquidityManager: LiquidityManager;
	let mockVault: MockVault;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;

	beforeEach(async () => {
		[owner, user1, user2] = await ethers.getSigners();

		// Deploy mock vault
		const MockVault = await ethers.getContractFactory("MockVault");
		mockVault = await MockVault.deploy(ethers.ZeroAddress);
		await mockVault.waitForDeployment();

        const underlying = await mockVault.getAddress();

		// Deploy LiquidityManager
		const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
		liquidityManager = await LiquidityManager.deploy(underlying, owner.address);
		await liquidityManager.waitForDeployment();

		// Add vault
		await liquidityManager.addVault(await mockVault.getAddress(), 100);
	});

	it("Should simulate", async () => {
		const results = [];
		// First deposit
		console.warn("Initial condtion: First deposit of 1 ETH at 0");
		const firstStake = ethers.parseEther("1");
		await liquidityManager.connect(user1).stake({ value: firstStake });

		let shares = await liquidityManager.balanceOf(user1.address);
		expect(shares).to.equal(firstStake);
		console.log("User 1 recieves", shares.toString(), "shares ozETH");
		results.push(["Shares", shares.toString()]);

		let assets = await liquidityManager.totalAssets();
		expect(assets).to.equal(ethers.parseEther("1"));
		console.log("Current amount of assets", assets.toString());

		let currentValue = await liquidityManager.getValueInEth.staticCall();
		expect(currentValue).to.equal(ethers.parseEther("1"));
		console.log("Current value in ETH", currentValue.toString());

		let totalSupply = await liquidityManager.totalSupply();
		expect(totalSupply).to.equal(ethers.parseEther("1"));
		console.log("Total supply ozETH", totalSupply.toString());

		// Update the mock vault price
		await mockVault.setMockPrice(ethers.parseEther("1.1"));
		assets = await liquidityManager.totalAssets();

		// Second deposit
		console.warn("Second deposit of 1 ETH after simulated price increase");
		const secondStake = ethers.parseEther("1");
		await liquidityManager.connect(user2).stake({ value: secondStake });
		let shares2 = await liquidityManager.balanceOf(user2.address);
		console.log("User 2 recieves", shares2.toString(), "shares ozETH");

		assets = await liquidityManager.totalAssets();
		// expect(assets).to.equal(ethers.parseEther("1"));
		console.log("Current amount of assets", assets.toString());

		currentValue = await liquidityManager.getValueInEth.staticCall();
		console.log("Current value in ETH", currentValue.toString());

		totalSupply = await liquidityManager.totalSupply();
		console.log("Total supply ozETH", totalSupply.toString());
		expect(totalShares).to.be.gt(0);
	});
});
