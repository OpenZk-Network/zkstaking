// import config before anything else
import { config as dotEnvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import "solidity-coverage";
import "@nomiclabs/hardhat-solhint";
import "@openzeppelin/hardhat-upgrades";

dotEnvConfig();

const PK = process.env.PK;
const SEPOLIA_PK = process.env.SEPOLIA_PK;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 100,
      },
      viaIR: true,
    },
  },
  etherscan: {
    apiKey: {
      mainnet:
        process.env.ETHSCAN_API_KEY || "",
      sepolia:
        process.env.ETHSCAN_API_KEY || "",
      holesky:
        process.env.ETHSCAN_API_KEY || "",
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.FORKING_URL as string,
        enabled: true,
        blockNumber: 21835718, //21834957, //21734426
      },
      blockGasLimit: 60000000, // Network block gasLimit
    },
    sepolia: {
      url: process.env.SEPOLIA_NODE as string,
      accounts: [SEPOLIA_PK as string],
    },
    holesky: {
      url: process.env.HOLESKY_NODE as string,
      accounts: [SEPOLIA_PK as string],
    },
    mainnet: {
      url:
        (process.env.MAINNET_NODE as string) ||
        "https://eth-mainnet.g.alchemy.com/v2/<key>",
      accounts: [PK as string],
    },
  },
  sourcify: {
    enabled: true,
  },
  mocha: {
    timeout: 100000000,
  },
};

export default config;
