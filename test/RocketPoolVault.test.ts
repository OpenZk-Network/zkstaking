import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre, { ethers, network, upgrades } from "hardhat";

const MAINNET_RETH = "0xae78736cd615f374d3085123a210448e74fc6393";
const UNISWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

describe("Rocket Pool Vault", () => {
	async function deployFixture() {
		const [owner, otherAccount, alice, bob, upgrader] = await hre.ethers.getSigners();

		// Get whale account to impersonate
		const ROBINHOOD_ADDRESS = "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489";

		// Impersonating robinHood's account
		// await network.provider.request({
		// 	method: "hardhat_impersonateAccount",
		// 	params: [ROBINHOOD_ADDRESS]
		// });

		// await setBalance(addressWithRETH, ethers.parseEther("10"));
		await impersonateAccount(ROBINHOOD_ADDRESS);

		// Make robinHood the signer
		const robinHood = await ethers.getSigner(ROBINHOOD_ADDRESS);

		// Check the balance of the account
		const balance = await ethers.provider.getBalance(ROBINHOOD_ADDRESS);
		expect(balance).to.be.gt(0);

		// Send owner 1 eth
		const tx = await robinHood.sendTransaction({
			to: await owner.getAddress(),
			value: ethers.parseEther("1")
		});

		// Wait for the transaction to be mined
		await tx.wait();

		// Send owner 1 eth
		const tx2 = await robinHood.sendTransaction({
			to: await alice.getAddress(),
			value: ethers.parseEther("10")
		});

		// Wait for the transaction to be mined
		await tx2.wait();

		const tx3 = await robinHood.sendTransaction({
			to: await bob.getAddress(),
			value: ethers.parseEther("10")
		});

		// Wait for the transaction to be mined
		await tx3.wait();

		// rETH whale
		const tx4 = await robinHood.sendTransaction({
			to: "0xe76af4a9a3e71681f4c9be600a0ba8d9d249175b",
			value: ethers.parseEther("10")
		});

		// Wait for the transaction to be mined
		await tx4.wait();

		const Oracle = await ethers.getContractFactory("UniswapOracle");
		const oracle = await Oracle.deploy(3000);
		const oracleAddress = await oracle.getAddress();

		const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
		const liquidityManager = await LiquidityManager.deploy(oracleAddress, owner.address);

		const liquidityManagerAddress = await liquidityManager.getAddress();

		// Grant permissions
		const MODIFIER_ROLE = await liquidityManager.MODIFIER_ROLE();

		const vault = await upgrades.deployProxy(await ethers.getContractFactory("RocketPoolVault"), [1000, "ozreth", "OZR", owner.address, upgrader.address], {
			kind: "uups",
			constructorArgs: [oracleAddress, liquidityManagerAddress, UNISWAP_ROUTER]
		});

		await vault.grantRole(MODIFIER_ROLE, owner.address);

		// const vault = await RocketPoolVault.deploy(oracleAddress, liquidityManagerAddress, UNISWAP_ROUTER);
		const provider = ethers.provider;

		// Get rETH contract
		const reth = await ethers.getContractAt("IERC20", MAINNET_RETH);

		return {
			vault,
			owner,
			robinHood,
			otherAccount,
			provider,
			reth,
			alice,
			bob
		};
	}

	describe("Deployment", () => {
		it("Should correctly deploy the vault", async () => {
			const { vault } = await loadFixture(deployFixture);

			expect(await vault.uniswapPortion()).to.equal(10);
			expect(await vault.balancerPortion()).to.equal(90);
			expect(await vault.totalAssets()).to.equal(0);

			const asset = await vault.asset();
			expect(asset).to.equal("0xae78736Cd615f374D3085123A210448E74Fc6393");
		});

		it("Should let owner set weights", async () => {
			const { vault, owner } = await loadFixture(deployFixture);

			expect(await vault.uniswapPortion()).to.equal(10);
			expect(await vault.balancerPortion()).to.equal(90);

			await expect(vault.connect(owner).setWeight(60, 40)).to.emit(vault, "WeightsUpdated").withArgs(60, 40);

			expect(await vault.uniswapPortion()).to.equal(60);
			expect(await vault.balancerPortion()).to.equal(40);
		});

		it("Should not let non-owner set weights", async () => {
			const { vault, otherAccount } = await loadFixture(deployFixture);
			await expect(vault.connect(otherAccount).setWeight(60, 40))
				.to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
				.withArgs(otherAccount.address, "0x0000000000000000000000000000000000000000000000000000000000000000");
		});

		it("Should not allow uniswap and balancer weights to exceed 100", async () => {
			const { vault, owner } = await loadFixture(deployFixture);
			await expect(vault.connect(owner).setWeight(60, 50)).to.be.revertedWith("setWeight: Invalid weight");
		});
	});

	describe("Deposit and withdraw flow", () => {
		it("Should not allow direct deposit of ETH", async () => {
			const { vault, robinHood, provider } = await loadFixture(deployFixture);

			const depositAmount = hre.ethers.parseEther("1");
			const whaleBalance = await provider.getBalance(robinHood.address);
			expect(whaleBalance).to.be.greaterThanOrEqual(depositAmount);

			await expect(vault.connect(robinHood).deposit(0, robinHood.address, { value: depositAmount })).to.be.revertedWith("only LM");
		});
	});

	describe("Emergency functions", () => {
		it("Should allow owner to emergency withdraw", async () => {
			const { vault, owner, reth } = await loadFixture(deployFixture);

			// Emergency withdraw
			await expect(vault.connect(owner).emergencyWithdraw()).to.not.be.reverted;

			// Check balances
			expect(await reth.balanceOf(await vault.getAddress())).to.equal(0);
			expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
		});

		it("Should not allow non-owner to emergency withdraw", async () => {
			const { vault, otherAccount } = await loadFixture(deployFixture);

			await expect(vault.connect(otherAccount).emergencyWithdraw()).to.be.reverted;
		});
	});
});
