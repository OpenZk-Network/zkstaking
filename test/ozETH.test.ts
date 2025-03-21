import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("ozETH", () => {
	async function deployFixture() {
		const [owner] = await ethers.getSigners();

		const ozETH = await ethers.getContractFactory("ozETH");
		const inital: bigint = ethers.parseUnits("0.001", 18);
		const token = await ozETH.deploy(owner.address, { value: inital });

		return { token, owner };
	}

	describe("Deployment test", () => {
		it("Should deploy token and mint", async () => {
			const { token, owner } = await loadFixture(deployFixture);

			const totalSupply = await token.totalSupply();
			expect(totalSupply).to.equal(ethers.parseEther("0.001"));

			const ownerBalance = await token.balanceOf(await owner.getAddress());
			expect(ownerBalance).to.equal(ethers.parseEther("0.001"));
		});
	});
});
