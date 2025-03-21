import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Oracle", () => {
	async function deployFixture() {
		const [owner] = await ethers.getSigners();

		const Oracle = await ethers.getContractFactory("UniswapOracle");
		const oracle = await Oracle.deploy(100);

		const provider = ethers.provider;

		return { oracle, owner, provider };
	}

	describe("Integration Test", () => {
		it("Should get rocket pool price", async () => {
			const { oracle } = await loadFixture(deployFixture);

			const rRETH = "0xae78736cd615f374d3085123a210448e74fc6393";

			const quote = await oracle.getValueInEth.staticCall(rRETH);
			expect(quote).to.be.gt(0);
		});
	});
});
