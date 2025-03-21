// import { HardhatRuntimeEnvironment } from "hardhat/types";
import { config as dotEnvConfig } from "dotenv";
import { ethers, upgrades, run } from "hardhat";

dotEnvConfig();

// Constructor arguments
const CONSTRUCTOR_ARGS = {
	oracle: "0x025E9049A9289c64E12F47D17449AA884D648F7B",
	liquidityManager: "0x137124b4cb0e4B449D2472D8103417dAb526eBD2",
	v3Router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
	rewardsCoordinator: "0x7750d328b314EfFa365A0402CcfD489B80B0adda"
};

async function main() {
	// Get the private key and setup account
	const PRIVATE_KEY = process.env.PK;
	if (!PRIVATE_KEY) {
		throw new Error("Missing PK in .env file");
	}

	// You'll need to replace this with your proxy address
	const PROXY_ADDRESS = "0x98B976d8bc43fDCFb000e2A60a797F34911b89e8";
	console.log("Proxy address:", PROXY_ADDRESS);

	try {
		// Get the contract factory
		const EigenLayerRETHVault = await ethers.getContractFactory("EigenLayerRETHVault");

		console.log("Preparing upgrade...");
		const upgradedContract = await upgrades.upgradeProxy(PROXY_ADDRESS, EigenLayerRETHVault, {
			kind: "uups",
			unsafeAllow: ["constructor"], // Required due to the constructor parameters
			constructorArgs: [CONSTRUCTOR_ARGS.oracle, CONSTRUCTOR_ARGS.liquidityManager, CONSTRUCTOR_ARGS.v3Router, CONSTRUCTOR_ARGS.rewardsCoordinator]
		});

		console.log("Waiting for deployment...");
		await upgradedContract.waitForDeployment();

		const implementationAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
		console.log("New implementation deployed to:", implementationAddress);
		console.log("Proxy upgraded successfully");

		// Wait a few block confirmations for Etherscan verification
		const CONFIRMATIONS = 5;
		const deployTx = await upgradedContract.deploymentTransaction();
		if (deployTx) {
			await deployTx.wait(CONFIRMATIONS);
		}

		// Verify the implementation contract on Etherscan
		if (process.env.ETHERSCAN_API_KEY) {
			console.log("Verifying contract on Etherscan...");
			await run("verify:verify", {
				address: implementationAddress,
				constructorArguments: [CONSTRUCTOR_ARGS.oracle, CONSTRUCTOR_ARGS.liquidityManager, CONSTRUCTOR_ARGS.v3Router, CONSTRUCTOR_ARGS.rewardsCoordinator]
			});
			console.log("Contract verified on Etherscan");
		}
	} catch (error) {
		console.error("Error during upgrade:", error);
		process.exitCode = 1;
	}
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
