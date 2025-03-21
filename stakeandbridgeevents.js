const { ethers } = require("ethers");

const BRIDGE_ADDRESS = "0xcf8edfe56f8aa401f5a95f74394a905999539286";
const RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// The event signature from the contract
const ABI = ["event StakeAndBridge(address token, uint256 amount, uint256 ozUSDMinted, uint256 l2GasLimit, uint256 l2GasPerPubdataByteLimit, uint256 gasMinted)"];

async function getStakeAndBridgeEvents(startBlock = 21909291, endBlock = "latest") {
	// Create contract instance
	const contract = new ethers.Contract(BRIDGE_ADDRESS, ABI, provider);

	// Create filter for StakeAndBridge events
	const filter = contract.filters.StakeAndBridge();

	try {
		// Get all events
		const events = await contract.queryFilter(filter, startBlock, endBlock);

		// Process each event
		events.forEach((event, index) => {
			console.log(`\nEvent #${index + 1}:`);
			console.log(`Transaction Hash: ${event.transactionHash}`);
			console.log(`Block Number: ${event.blockNumber}`);
			console.log(`Token Address: ${event.args.token}`);
			console.log(`Amount: ${ethers.formatUnits(event.args.amount, 18)}`);
			// console.log(`ozUSD Minted: ${ethers.formatUnits(event.args.ozUSDMinted, 18)}`);
            console.log(`ozUSD Minted: ${event.args.ozUSDMinted}`);
		});

		return events;
	} catch (error) {
		console.error("Error fetching events:", error);
		throw error;
	}
}

// Example usage
async function main() {
	try {
		// Get events from the last 1000 blocks
		const currentBlock = await provider.getBlockNumber();
		const events = await getStakeAndBridgeEvents(currentBlock - 1000, currentBlock);
		console.log(`Total events found: ${events.length}`);
	} catch (error) {
		console.error("Error in main:", error);
	}
}

main();
