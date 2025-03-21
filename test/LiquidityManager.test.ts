import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { LiquidityManager, MockERC20, MockVault, RocketPoolVault } from "../typechain-types";

import { expect } from "chai";
import { ethers } from "hardhat";

const UNISWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

describe("Liquidity Manager", () => {
	let liquidityManager: LiquidityManager;
	let mockVault1: MockVault;
	let mockVault2: MockVault;
	let rocketPoolVault: RocketPoolVault;
	let rocketPoolVault2: RocketPoolVault;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;
	let underlying: MockERC20;

	describe("Deployment", () => {
		beforeEach(async () => {
			// Get signers
			[owner] = await ethers.getSigners();

			// Deploy mock underlying token (replaces direct ETH handling)
			const MockToken = await ethers.getContractFactory("MockERC20");
			underlying = await MockToken.deploy("Staked ETH", "sETH");
			await underlying.waitForDeployment();

			const underlyingAddress = await underlying.getAddress();

			// Deploy LiquidityManager with underlying token
			const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
			liquidityManager = await LiquidityManager.deploy(underlyingAddress, owner.address);
			await liquidityManager.waitForDeployment();
		});

		it("Should set the default admin", async () => {
			const DEFAULT_ADMIN = await liquidityManager.DEFAULT_ADMIN_ROLE();
			expect(await liquidityManager.hasRole(DEFAULT_ADMIN, owner.address)).to.be.true;
		});

		it("Should initialize with zero vaults", async () => {
			expect(await liquidityManager.getVaultCount()).to.equal(0);
			expect(await liquidityManager.totalWeight()).to.equal(0);
		});

		it("Should have a zero nonce", async () => {
			expect(await liquidityManager.getNonce()).to.equal(0);
		});

		it("Should set the correct underlying token", async () => {
			expect(await liquidityManager.underlying()).to.equal(await underlying.getAddress());
		});

		it.only("Should preview a deposit correctly with a 0 balance", async () => {
			// Arrange
			await mockVault1.setWithdrawalAmount(0, true);
			await mockVault2.setWithdrawalAmount(0, true);

			const depositAmount = ethers.parseEther("1");
			const shares = await liquidityManager.previewDeposit.staticCall(depositAmount);
			expect(shares).to.equal(depositAmount);
		});

		it("Should allow admin to toggle pause", async () => {
			await expect(liquidityManager.togglePause()).to.be.reverted;

			const ADMIN_ROLE = await liquidityManager.ADMIN_ROLE();
			await liquidityManager.grantRole(ADMIN_ROLE, owner.address);

			await liquidityManager.togglePause();
			expect(await liquidityManager.paused()).to.be.true;

			await liquidityManager.togglePause();
			expect(await liquidityManager.paused()).to.be.false;
		});
	});

	describe("Vault Management", () => {
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
			mockVault1 = await MockVault.deploy(underlyingAddress);
			await mockVault1.waitForDeployment();

			mockVault2 = await MockVault.deploy(underlyingAddress);
			await mockVault2.waitForDeployment();

			const oracle = await ethers.getContractFactory("MockOracle");
			const mockOracle = await oracle.deploy();
			await mockOracle.waitForDeployment();

			const oracleAddress = await mockOracle.getAddress();

			// Deploy LiquidityManager with underlying token
			const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
			liquidityManager = await LiquidityManager.deploy(underlyingAddress, owner.address);
			await liquidityManager.waitForDeployment();

			// Allow LM to mint and burn
			const liquidityManagerAddress = await liquidityManager.getAddress();
			await underlying.connect(owner).approve(liquidityManagerAddress, 100n);

			const RocketPoolVault = await ethers.getContractFactory("RocketPoolVault");
			rocketPoolVault = await RocketPoolVault.deploy(oracleAddress, liquidityManagerAddress, UNISWAP_ROUTER);
			await rocketPoolVault.waitForDeployment();

			rocketPoolVault2 = await RocketPoolVault.deploy(oracleAddress, liquidityManagerAddress, UNISWAP_ROUTER);
			await rocketPoolVault2.waitForDeployment();

			const MODIFIER_ROLE = await liquidityManager.MODIFIER_ROLE();
			await liquidityManager.grantRole(MODIFIER_ROLE, owner.address);
		});

		it("Should fail when staking with no vaults", async () => {
			const stakeAmount = ethers.parseEther("1");
			await expect(liquidityManager.connect(user1).stake({ value: stakeAmount })).to.be.revertedWith("stake: Total weight is 0");
		});

		it("Should add vault correctly", async () => {
			const vaultAddress = await rocketPoolVault.getAddress();
			await expect(liquidityManager.addVault(vaultAddress, 50)).to.emit(liquidityManager, "VaultAdded").withArgs(vaultAddress);

			expect(await liquidityManager.getVaultCount()).to.equal(1);
			expect(await liquidityManager.totalWeight()).to.equal(50);

			const vault = await liquidityManager.getVaultAt(0);
			expect(vault.vault).to.equal(vaultAddress);
			expect(vault.weight).to.equal(50);
		});

		it("Should not allow adding same vault twice", async () => {
			const vaultAddress = await rocketPoolVault.getAddress();
			await liquidityManager.addVault(vaultAddress, 50);
			await expect(liquidityManager.addVault(vaultAddress, 50)).to.be.reverted;
		});

		it("Should remove vault correctly", async () => {
			const vaultAddress1 = await rocketPoolVault.getAddress();
			const vaultAddress2 = await rocketPoolVault2.getAddress();

			await liquidityManager.addVault(vaultAddress1, 50);
			await liquidityManager.addVault(vaultAddress2, 50);

			expect(await liquidityManager.totalWeight()).to.equal(100);

			await expect(liquidityManager.removeVault(0)).to.emit(liquidityManager, "VaultRemoved").withArgs(vaultAddress1);

			expect(await liquidityManager.getVaultCount()).to.equal(1);
			expect(await liquidityManager.totalWeight()).to.equal(50);
		});

		it("Should fail when non-owner tries to add vault", async () => {
			await expect(liquidityManager.connect(user1).addVault(await mockVault1.getAddress(), 50))
				.to.be.revertedWithCustomError(liquidityManager, "AccessControlUnauthorizedAccount")
				.withArgs(user1.address, "0x62ca43aa15f7f495faa685ce5a258aa390fdc8d7094251dd23d32353f496ddfe");
		});
	});

	describe("Staking and Unstaking", () => {
		const stakeAmount = ethers.parseEther("1");
		let mockVault1: MockVault;
		let mockVault2: MockVault;

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
			mockVault1 = await MockVault.deploy(underlyingAddress);
			await mockVault1.waitForDeployment();

			mockVault2 = await MockVault.deploy(underlyingAddress);
			await mockVault2.waitForDeployment();

			const oracle = await ethers.getContractFactory("MockOracle");
			const mockOracle = await oracle.deploy();
			await mockOracle.waitForDeployment();

			const oracleAddress = await mockOracle.getAddress();

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

		it("Should stake ETH correctly", async () => {
			await expect(liquidityManager.connect(user1).stake({ value: stakeAmount }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user1.address, stakeAmount);
		});

		it("Should fail when staking 0 ETH", async () => {
			await expect(liquidityManager.connect(user1).stake({ value: 0 })).to.be.revertedWith("stake: Invalid amount");
		});
	});
});
