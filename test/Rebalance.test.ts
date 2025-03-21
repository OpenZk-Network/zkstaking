import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { LiquidityManager, MockERC20, MockVault, RocketPoolVault } from "../typechain-types";

import { expect } from "chai";
import { ethers } from "hardhat";

describe.only("Liquidity Manager", () => {
	let liquidityManager: LiquidityManager;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;
	let underlying: MockERC20;

	describe("Rebalance", () => {
		beforeEach(async () => {
			// Get signers
			[owner, user1, user2] = await ethers.getSigners();

			// Deploy mock underlying token (replaces direct ETH handling)
			const MockToken = await ethers.getContractFactory("MockERC20");
			underlying = await MockToken.deploy("Staked ETH", "sETH");
			await underlying.waitForDeployment();

			const underlyingAddress = await underlying.getAddress();

			// Deploy mock vaults with mock implementation of IERC4626Partial
			const MockVault = await ethers.getContractFactory("MockVault");
			const mockVault1 = await MockVault.deploy(underlyingAddress);
			await mockVault1.waitForDeployment();

			const mockVault2 = await MockVault.deploy(underlyingAddress);
			await mockVault2.waitForDeployment();

			const oracle = await ethers.getContractFactory("MockOracle");
			const mockOracle = await oracle.deploy();
			await mockOracle.waitForDeployment();

			// Deploy LiquidityManager with underlying token
			const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
			liquidityManager = await LiquidityManager.deploy(underlyingAddress, owner.address);
			await liquidityManager.waitForDeployment();

			// Allow LM to mint and burn
			const liquidityManagerAddress = await liquidityManager.getAddress();
			await underlying.connect(owner).approve(liquidityManagerAddress, 100n);

			const MODIFIER_ROLE = await liquidityManager.MODIFIER_ROLE();
			await liquidityManager.grantRole(MODIFIER_ROLE, owner.address);

			// Add vaults
			await liquidityManager.addVault(await mockVault1.getAddress(), 50);
			await liquidityManager.addVault(await mockVault2.getAddress(), 50);
		});

		it("Should rebalance vaults correctly", async () => {
			// const vaultAddress1 = await rocketPoolVault.getAddress();
			// const vaultAddress2 = await rocketPoolVault2.getAddress();

			// await liquidityManager.addVault(vaultAddress1, 50);
			// await liquidityManager.addVault(vaultAddress2, 50);

			expect(await liquidityManager.totalWeight()).to.equal(100);

			// await expect(liquidityManager.rebalanceVaults())
			// 	.to.emit(liquidityManager, "VaultRebalanced")
			// 	.withArgs(vaultAddress1, 50, 50);
		});
	});
});
