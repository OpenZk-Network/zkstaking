import { expect } from "chai";
import hre, { ethers, network } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SkyMoneyVault } from "../typechain-types";

describe("USDS Vault", () => {
	let vault: SkyMoneyVault;
	let owner: SignerWithAddress;

	const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
	const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
	const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

	beforeEach(async () => {
		[owner] = await ethers.getSigners();

		// Deploy mock vault
		const Vault = await ethers.getContractFactory("SkyMoneyVault");
		vault = await Vault.deploy(
			DAI,
			owner,
			100n,
			"0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
			"0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A",
			"0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
		);

		await vault.waitForDeployment();

		// Get whale account to impersonate
		const ROBINHOOD_ADDRESS = "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489";

		// Impersonating robinHood's account
		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [ROBINHOOD_ADDRESS]
		});

		// Make robinHood the signer
		const robinHood = await ethers.getSigner(ROBINHOOD_ADDRESS);

		// Check the balance of the account
		const balance = await ethers.provider.getBalance(ROBINHOOD_ADDRESS);
		expect(balance).to.be.gt(0);

		const testAccount = "0xE5175d659dAF098701B9a44e09f256627Ad87E6f";
		const testAccount2 = "0xEa36BDfaE0280831c1cC6Aca0E9e25C7D1ECbAf7";

		// Send owner 1 eth
		const tx = await robinHood.sendTransaction({
			to: testAccount,
			value: ethers.parseEther("1")
		});

		// Send owner 1 eth
		const tx2 = await robinHood.sendTransaction({
			to: testAccount2,
			value: ethers.parseEther("1")
		});

		await vault.connect(owner).setNewCliff(0);
		await vault.connect(owner).allowToken(USDT, true);
	});

	it("Should have correct properites", async () => {
		expect(await vault.asset()).to.equal(DAI);
		expect(await vault.name()).to.equal("ozUSD");
		expect(await vault.symbol()).to.equal("ozUSD");

		expect(await vault.isAllowedToken(DAI)).to.be.true;
		expect(await vault.isAllowedToken(USDT)).to.be.true;
		expect(await vault.isAllowedToken(USDC)).to.be.false;
	});

	it("Should set allowed token", async () => {
		expect(await vault.connect(owner).allowToken(USDT, true))
			.to.emit(vault, "TokenSet")
			.withArgs(USDT, true);
	});

	it("Should mint correct number of shares using DAI", async () => {
		const erc20_abi = [
			"function balanceOf(address owner) view returns (uint256)",
			"function approve(address usr, uint wad) external returns (bool)",
			"function transfer(address to, uint256 amount) returns (bool)"
		];

		// test account
		const testAccount = "0xE5175d659dAF098701B9a44e09f256627Ad87E6f";

		// Impersonate account
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [testAccount]
		});

		// get signer
		const signer = await hre.ethers.getSigner(testAccount);

		// get DAI contract
		const dai = new ethers.Contract(DAI, erc20_abi, ethers.provider);

		// get balance
		const dai_balance = await dai.balanceOf(testAccount);
		expect(dai_balance).to.be.gt(0);

		const TEN_THOUSAND_DAI = ethers.parseUnits("10000", 18);
		const TEN_DAI = ethers.parseUnits("10", 18);

		// approve vault
		const vaultAddress = await vault.getAddress();
		await dai.connect(signer).approve(vaultAddress, TEN_DAI);

		// deposit
		await vault.connect(signer).deposit(TEN_DAI, signer.address);

		// check shares
		const shares = await vault.balanceOf(testAccount);

		// fast forward 10 days
		await mine(864000);

		// queue withdrawal of all shares
		await vault.connect(signer).queueWithdraw(shares);

		// fast forward 1 day
		await mine(86400);

		// withdraw
		const index = 0n;
		await vault.connect(signer).withdraw(index);
	});

	it("Should mint correct number of shares using USDC", async () => {
		const erc20_abi = [
			"function balanceOf(address owner) view returns (uint256)",
			"function approve(address usr, uint wad) external returns (bool)",
			"function transfer(address to, uint256 amount) returns (bool)"
		];

		// test account
		const testAccount = "0xEa36BDfaE0280831c1cC6Aca0E9e25C7D1ECbAf7";

		// Impersonate account
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [testAccount]
		});

		// arrange
		await vault.connect(owner).allowToken(USDC, true);

		// get signer
		const signer = await hre.ethers.getSigner(testAccount);
		expect(signer).to.not.be.undefined;
		expect(signer.address).to.be.eq(testAccount);

		// get USDC contract
		const usdc = new ethers.Contract(USDC, erc20_abi, ethers.provider);

		// get balance
		let usdc_balance = await usdc.balanceOf(testAccount);
		expect(usdc_balance).to.be.eq(469806532n);

		// get DAI contract
		const dai = new ethers.Contract(DAI, erc20_abi, ethers.provider);

		// Get their DAI balance
		let dai_balance = await dai.balanceOf(testAccount);
		expect(dai_balance).to.be.eq(0);

		const TEN_USDC = ethers.parseUnits("10", 6);

		// approve vault
		const vaultAddress = await vault.getAddress();
		await usdc.connect(signer).approve(vaultAddress, TEN_USDC);

		// deposit usdc
		await vault.connect(signer).depositToken(USDC, TEN_USDC, signer.address);

		// check usdc balance after deposit
		usdc_balance = await usdc.balanceOf(testAccount); // $10 less than before (469806532n)
		expect(usdc_balance).to.be.eq(459806532);

		// check dai balance after deposit
		dai_balance = await dai.balanceOf(testAccount);
		expect(dai_balance).to.be.eq(0);

		// check shares
		let shares = await vault.balanceOf(testAccount);
		expect(shares).to.be.gt(0);

		// fast forward 10 days
		await mine(864000);

		// queue withdrawal of all shares
		await vault.connect(signer).queueWithdraw(shares);

		// fast forward 1 day
		await mine(86400);

		// withdraw
		await vault.connect(signer).withdraw(0n);
		const usdc_balance_after = await usdc.balanceOf(testAccount);
		// expect(usdc_balance_after).to.be.eq(469806532n);

		shares = await vault.balanceOf(testAccount);
		expect(shares).to.be.equal(0n);

		// Get their USDC balance
		usdc_balance = await usdc.balanceOf(testAccount);
		expect(usdc_balance).to.be.gt(0);
	});

	it("Should mint correct number of shares using USDT", async () => {
		const erc20_abi = [
			"function balanceOf(address owner) view returns (uint256)",
			"function approve(address usr, uint wad) external returns (bool)",
			"function transfer(address to, uint256 amount) returns (bool)"
		];

		// test account
		const testAccount = "0xEa36BDfaE0280831c1cC6Aca0E9e25C7D1ECbAf7";

		// Impersonate account
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [testAccount]
		});

		// get signer
		const signer = await hre.ethers.getSigner(testAccount);

		// get USDT contract
		const usdt = new ethers.Contract(USDT, erc20_abi, ethers.provider);

		// get balance
		const usdt_balance = await usdt.balanceOf(testAccount);
		const TEN_USDT = ethers.parseUnits("10", 6);

		// approve vault
		const vaultAddress = await vault.getAddress();
		await usdt.connect(signer).approve(vaultAddress, TEN_USDT);

		// deposit
		await vault.connect(signer).depositToken(USDT, TEN_USDT, signer.address);

		// check shares
		let shares = await vault.balanceOf(testAccount);

		expect(shares).to.be.gt(0);

		// fast forward 10 days
		await mine(864000);

		// queue withdrawal of all shares
		await vault.connect(signer).queueWithdraw(shares);

		// fast forward 1 day
		await mine(86400);

		// withdraw
		await vault.connect(signer).withdraw(0n);
		const usdt_balance_after = await usdt.balanceOf(testAccount);

		expect(usdt_balance_after).to.be.gt(0n);

		shares = await vault.balanceOf(testAccount);
		expect(shares).to.be.equal(0n);
	});

	it.skip("Should mint correct number of shares using USDT and withdraw USDC", async () => {
		const erc20_abi = [
			"function balanceOf(address owner) view returns (uint256)",
			"function approve(address usr, uint wad) external returns (bool)",
			"function transfer(address to, uint256 amount) returns (bool)"
		];

		// test account
		const testAccount = "0xEa36BDfaE0280831c1cC6Aca0E9e25C7D1ECbAf7";

		// Impersonate account
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [testAccount]
		});

		// arrange
		await vault.connect(owner).allowToken(USDC, true);

		// get signer
		const signer = await hre.ethers.getSigner(testAccount);

		// get USDT contract
		const usdt = new ethers.Contract(USDT, erc20_abi, ethers.provider);
		const usdc = new ethers.Contract(USDC, erc20_abi, ethers.provider);

		// get us balances
		const usdt_balance = await usdt.balanceOf(testAccount);
		const usdc_balance = await usdc.balanceOf(testAccount);

		const TEN_USDT = ethers.parseUnits("10", 6);

		// approve vault
		const vaultAddress = await vault.getAddress();
		await usdt.connect(signer).approve(vaultAddress, TEN_USDT);

		// deposit
		await vault.connect(signer).depositToken(USDT, TEN_USDT, signer.address);

		let usdt_balance_after = await usdt.balanceOf(testAccount);
		let usdc_balance_after = await usdc.balanceOf(testAccount);

		// Less $10 USDT
		expect(usdt_balance_after).to.be.eq(1392505n);

		// No change in USDC
		expect(usdc_balance_after).to.be.eq(usdc_balance);

		// check shares
		let shares = await vault.balanceOf(testAccount);
		expect(shares).to.be.gt(0);

		// fast forward 10 days
		await mine(864000);

		// queue withdrawal of all shares to USDC
		await vault.connect(signer).queueWithdrawToken(shares, USDC);

		// fast forward 1 day
		await mine(86400);

		// withdraw
		await vault.connect(signer).withdraw(0n);
		usdt_balance_after = await usdt.balanceOf(testAccount);
		usdc_balance_after = await usdc.balanceOf(testAccount);

		// USDT the same
		expect(usdt_balance_after).to.be.eq(1392505n);

		// USDC increased by ~$10
		expect(usdc_balance_after).to.be.eq(731237622n);

		shares = await vault.balanceOf(testAccount);
		expect(shares).to.be.equal(0n);
	});
});
