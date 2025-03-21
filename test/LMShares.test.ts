import { expect } from "chai";
import { ethers } from "hardhat";

import { MockOracle, LiquidityManager, MockERC20, MockVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LiquidityManager", () => {
	let liquidityManager: LiquidityManager;
	let mockVault1: MockVault;
	let mockVault2: MockVault;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;
	let ozETH: MockERC20;
	let ozETHAddress: string;
	let underlying: MockERC20;
	let underlyingAddress: string;
	let mockOracle: MockOracle;

	beforeEach(async () => {
		// Get signers
		[owner, user1, user2] = await ethers.getSigners();

		// Deploy mock underlying token (replaces direct ETH handling)
		const MockToken = await ethers.getContractFactory("MockERC20");
		ozETH = await MockToken.deploy("Staked ETH", "sETH");
		await ozETH.waitForDeployment();

		ozETHAddress = await ozETH.getAddress();

		underlying = await MockToken.deploy("Staked ETH", "sETH");
		await underlying.waitForDeployment();

		underlyingAddress = await underlying.getAddress();

		// Deploy mock vaults with mock implementation of IERC4626Partial
		const MockVault = await ethers.getContractFactory("MockVault");
		mockVault1 = await MockVault.deploy(underlyingAddress);
		await mockVault1.waitForDeployment();

		mockVault2 = await MockVault.deploy(underlyingAddress);
		await mockVault2.waitForDeployment();

		const oracle = await ethers.getContractFactory("MockOracle");
		mockOracle = await oracle.deploy();
		await mockOracle.waitForDeployment();

		// Deploy LiquidityManager with underlying token
		const LiquidityManager = await ethers.getContractFactory("LiquidityManager");

		liquidityManager = await LiquidityManager.deploy(ozETH, owner.address);
		await liquidityManager.waitForDeployment();

		// Allow LM to mint and burn
		const liquidityManagerAddress = await liquidityManager.getAddress();
		await underlying.connect(owner).approve(liquidityManagerAddress, 100n);

		// Grant permissions
		const MODIFIER_ROLE = await liquidityManager.MODIFIER_ROLE();

		await liquidityManager.connect(owner).grantRole(ethers.hexlify(MODIFIER_ROLE), owner.address);
	});

	describe("Staking and Unstaking", () => {
		beforeEach(async () => {
			const mockVault1Address = await mockVault1.getAddress();
			await liquidityManager.addVault(mockVault1Address, 100);
		});

		it("Should stake 10 ETH correctly with mock vault", async () => {
			// Arrange
			await mockOracle.setValue(ethers.parseEther("1.1"));
			await ozETH.mint(user1.address, ethers.parseEther("25"));

			const user1Shares = await ozETH.balanceOf(user1.address);
			expect(user1Shares).to.equal(ethers.parseEther("25"));

			await mockVault1.setTotalAssets(ethers.parseEther("22.5"));
			await mockVault1.setMockPrice(ethers.parseEther("1.3"));

			const totalSupply = await ozETH.totalSupply();
			expect(totalSupply).to.equal(ethers.parseEther("25"));

			const virtualBalance = await liquidityManager.virtualBalance.staticCall();
			expect(virtualBalance).to.equal(29250000000000000000n);

			// Act
			const lmAddress = await liquidityManager.getAddress();
			await ozETH.connect(user2).approve(lmAddress, ethers.parseEther("10"));
			await liquidityManager.connect(user2).stake({ value: ethers.parseEther("10") });

			// Assert
			const user1SharesAfter = await ozETH.balanceOf(user2.address);
			expect(user1SharesAfter).to.be.greaterThan(0n);
		});
	});

	describe("End to end simulation", () => {
		let rethVault: MockVault;
		let methVault: MockVault;

		beforeEach(async () => {
			const MockVault = await ethers.getContractFactory("MockVault");
			rethVault = await MockVault.deploy(underlyingAddress);
			await rethVault.waitForDeployment();

			methVault = await MockVault.deploy(underlyingAddress);
			await methVault.waitForDeployment();

			const rethVaultAddress = await rethVault.getAddress();
			const methVaultAddress = await methVault.getAddress();

			// Setup the vaults to 65 and 35
			await liquidityManager.addVault(rethVaultAddress, 65);
			await liquidityManager.addVault(methVaultAddress, 35);

			// set mock price to 1.02
			await rethVault.setMockPrice(ethers.parseEther("1.1236"));

			// set mock price to 1.15
			await methVault.setMockPrice(ethers.parseEther("1.0869"));
		});

		it("Should stake ETH correctly in simulation", async () => {
			await expect(liquidityManager.connect(user1).stake({ value: ethers.parseEther("1") }))
				.to.emit(liquidityManager, "Staked")
				.withArgs(user1.address, ethers.parseEther("1"));

			let user1Shares = await ozETH.balanceOf(user1.address);
			expect(user1Shares).to.equal(ethers.parseEther("1"));

			expect(await rethVault.totalAssets()).to.equal(578497686009255962n);
			expect(await methVault.totalAssets()).to.equal(322016744870733278n);

			expect(await rethVault.virtualBalance()).to.equal(649999999999999998n);
			expect(await methVault.virtualBalance()).to.equal(349999999999999999n);

			await rethVault.setMockPrice(ethers.parseEther("1.1494")); // 1 / 0.87 = 1.1494
			await methVault.setMockPrice(ethers.parseEther("1.25"));

			await liquidityManager.connect(user1).stake({ value: ethers.parseEther("50") });

			expect(await rethVault.totalAssets()).to.equal(28854119749694657040n);
			expect(await methVault.totalAssets()).to.equal(14322016744870733278n);

			user1Shares = await ozETH.balanceOf(user1.address);
			expect(user1Shares).to.equal(47840769436655078870n);

			await rethVault.setMockPrice(ethers.parseEther("1.1363")); // 1 / 0.88 = 1.1363
			await methVault.setMockPrice(ethers.parseEther("1.6667")); // 1 / 0.60 = 1.6667

			await liquidityManager.connect(user1).stake({ value: ethers.parseEther("10") });

			expect(await rethVault.totalAssets()).to.equal(34574440087633581619n);
			expect(await methVault.totalAssets()).to.equal(16421974745710716478n);
		});
	});
});
