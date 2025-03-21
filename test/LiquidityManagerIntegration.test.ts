import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { expect } from "chai";
import hre, { ethers, network } from "hardhat";
import { ERC20, LiquidityManager, RocketPoolVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const UNISWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
// Get whale account to impersonate
const ROBINHOOD_ADDRESS = "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489";

describe("Liquidity Manager Integration", () => {
	const deployFixture = async () => {
		// Contracts are deployed using the first signer/account by default
		const [owner, otherAccount] = await hre.ethers.getSigners();

		// Impersonating whale account
		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [ROBINHOOD_ADDRESS]
		});

		// Make whale the signer
		const whale = await hre.ethers.getSigner(ROBINHOOD_ADDRESS);

		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: ["0xE5175d659dAF098701B9a44e09f256627Ad87E6f"]
		});

		const ozkUAT = await hre.ethers.getSigner("0xE5175d659dAF098701B9a44e09f256627Ad87E6f");

		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: ["0x9Fd84A9443e9e8588B985336c463865F0Af009e6"]
		});

		const ozkUAT2 = await hre.ethers.getSigner("0x9Fd84A9443e9e8588B985336c463865F0Af009e6");

		// Send owner 1 eth
		const tx = await whale.sendTransaction({
			to: "0xE5175d659dAF098701B9a44e09f256627Ad87E6f",
			value: ethers.parseEther("1")
		});

		// Wait for the transaction to be mined
		await tx.wait();

		const mockUnderlying = await hre.ethers.getContractFactory("MockERC20");
		const underlying = await mockUnderlying.deploy("OZ Eth", "ozETH");

		// await token.deployed();
		const underlyingAddress = await underlying.getAddress();

		const LiquidityManager = await hre.ethers.getContractFactory("LiquidityManager");

		const manager = await LiquidityManager.deploy(underlyingAddress, owner.address);
		const provider = hre.ethers.provider;

		// Note: Anyone can mint the underlying token, but we should set the LM as minter

		return {
			manager,
			owner,
			whale,
			ozkUAT,
			ozkUAT2,
			otherAccount,
			underlying,
			provider
		};
	};

	describe("Setup and Deployment", () => {
		it("Should setup the Liquidity Manager", async () => {
			const { manager } = await loadFixture(deployFixture);

			const virtualBalance = await manager.virtualBalance.staticCall();
			expect(virtualBalance).to.equal(0);
		});
	});

	describe("Integration tests on LM", () => {
		let manager: LiquidityManager;
		let whale: SignerWithAddress;
		let ozkUAT: SignerWithAddress;
		let ozkUAT2: SignerWithAddress;
		let owner: SignerWithAddress;
		let vault: RocketPoolVault;
		let underlying: ERC20;

		beforeEach(async () => {
			({ manager, owner, whale, ozkUAT, ozkUAT2, underlying } = await loadFixture(deployFixture));

			const managerAddress = await manager.getAddress();

			// Grant permissions
			const MODIFIER_ROLE = await manager.MODIFIER_ROLE();

			await manager.connect(owner).grantRole(ethers.hexlify(MODIFIER_ROLE), owner.address);

			// Use deployed vault or deploy a new one
			const useDeployedVault = false;

			if (useDeployedVault) {
				const rplVaultAddress = "0x20E1C62762D496b2a0d559C603d462DfB7746890";
				await manager.connect(owner).addVault(rplVaultAddress, 100);
			} else {
				const deployedChainLinkOracle = "0x025E9049A9289c64E12F47D17449AA884D648F7B";

				const RocketPoolVault = await hre.ethers.getContractFactory("RocketPoolVault");

				vault = await RocketPoolVault.deploy(deployedChainLinkOracle, managerAddress, UNISWAP_ROUTER);

				const vaultAddress = await vault.getAddress();
				await manager.connect(owner).addVault(vaultAddress, 100);
			}

			// Send owner 1 eth
			const tx = await whale.sendTransaction({
				to: ozkUAT.address,
				value: ethers.parseEther("1")
			});

			// Wait for the transaction to be mined
			await tx.wait();

			const tx2 = await whale.sendTransaction({
				to: ozkUAT2.address,
				value: ethers.parseEther("1")
			});

			// Wait for the transaction to be mined
			await tx2.wait();
		});

		it("Should revert when no eth sent", async () => {
			await expect(manager.connect(whale).stake()).to.be.revertedWith("stake: Invalid amount");
		});

		it("Should stake assets and receive ozETH tokens", async () => {
			const amount = ethers.parseEther("0.005");

			const balanceBefore = await ethers.provider.getBalance(ozkUAT.address);
			const tokenBalanceBefore = await underlying.balanceOf(ozkUAT.address);

			expect(balanceBefore).to.be.greaterThan(0);
			expect(tokenBalanceBefore).to.be.equal(0);

			await manager.connect(ozkUAT).stake({ value: amount });
			const tokenBalanceAfter = await underlying.balanceOf(ozkUAT.address);

			// Manager should not have any ETH
			expect(await manager.virtualBalance.staticCall()).to.be.greaterThan(0);
			expect(tokenBalanceAfter).to.be.greaterThan(0);
			expect(tokenBalanceAfter).to.be.gt(tokenBalanceBefore);

			// Stake more assets from another account
			await manager.connect(ozkUAT2).stake({ value: amount });
			expect(await underlying.balanceOf(ozkUAT2.address)).to.be.greaterThan(0);
		});

		it("Should not restake when restaking contract is not set", async () => {
			const erc20_abi = ["function balanceOf(address) external view returns (uint256)", "function approve(address spender, uint256 amount) external returns (bool)"];

			const rethContract = new hre.ethers.Contract("0xae78736cd615f374d3085123a210448e74fc6393", erc20_abi, ethers.provider);

			const vaultAddress = await vault.getAddress();
			const vaultBalanceBefore = await ethers.provider.getBalance(vaultAddress);

			expect(vaultBalanceBefore).to.equal(0);
			const rethVaultBalanceBfore = await rethContract.balanceOf(vaultAddress);
			expect(rethVaultBalanceBfore).to.be.eq(0);

			const managerAddress = await manager.getAddress();
			const balanceBefore = await ethers.provider.getBalance(managerAddress);
			expect(balanceBefore).to.equal(0);

			const amount = ethers.parseEther("1");
			await manager.connect(whale).stake({ value: amount });

			const balanceAfter = await ethers.provider.getBalance(managerAddress);
			expect(balanceAfter).to.equal(0);

			// rEth should be restaked
			const rethVaultBalanceAfter = await rethContract.balanceOf(vaultAddress);
			expect(rethVaultBalanceAfter).to.be.gt(0);
		});
	});
});
