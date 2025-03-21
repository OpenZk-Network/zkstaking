import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { LiquidityManager, RocketPoolVault } from "../typechain-types";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Vault Conversion", () => {
	let liquidityManager: LiquidityManager;
	let vault1: RocketPoolVault;
	let vault2: RocketPoolVault;
	let owner: SignerWithAddress;

	beforeEach(async () => {
		[owner] = await ethers.getSigners();

		const RocketPoolVault = await ethers.getContractFactory("RocketPoolVault");
		vault1 = await RocketPoolVault.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
		await vault1.waitForDeployment();

		vault2 = await RocketPoolVault.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
		await vault2.waitForDeployment();

		const MockERC20 = await ethers.getContractFactory("MockERC20");
		const mockERC20 = await MockERC20.deploy("Mock", "MCK");
		await mockERC20.waitForDeployment();

		const mockERC20Address = await mockERC20.getAddress();

		// Deploy LiquidityManager
		const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
		liquidityManager = await LiquidityManager.deploy(mockERC20Address, owner.address);
		await liquidityManager.waitForDeployment();

		const MODIFIER_ROLE = await liquidityManager.MODIFIER_ROLE();
		await liquidityManager.grantRole(MODIFIER_ROLE, owner.address);
	});

	it("Should maintain vault data integrity through conversion", async () => {
		// Add vault with weight
		const weight = 50;
		await liquidityManager.addVault(await vault2.getAddress(), weight);

		// Get vault back from storage
		const vault = await liquidityManager.getVaultAt(0);

		// Verify data integrity
		expect(vault.weight).to.equal(weight);
		expect(vault.vault).to.equal(await vault2.getAddress());
	});

	it("Should handle edge case weights", async () => {
		// Test with minimum weight
		await liquidityManager.addVault(await vault1.getAddress(), 1);
		let vault = await liquidityManager.getVaultAt(0);
		expect(vault.weight).to.equal(1);

		// Clear vaults
		await liquidityManager.removeVault(0);

		// Test with maximum weight
		await liquidityManager.addVault(await vault2.getAddress(), 255);
		vault = await liquidityManager.getVaultAt(0);
		expect(vault.weight).to.equal(255);
	});
});
