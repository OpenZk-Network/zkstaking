import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const oracle = "0x025E9049A9289c64E12F47D17449AA884D648F7B"; // Chainlink Oracle
const liquidityManager = "0x137124b4cb0e4B449D2472D8103417dAb526eBD2";
const v3Router = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

const ProxyModule = buildModule("ProxyModule", (builder) => {
  // Deploy the implementation contract
  const implementation = builder.contract("RocketPoolVault", [oracle, liquidityManager, v3Router], {});

  // Encode the initialize function call for the contract.
  const initialize = builder.encodeFunctionCall(implementation, "initialize", [
    "1000",
    "ozreth",
    "OZR",
    "0xE5175d659dAF098701B9a44e09f256627Ad87E6f", // admin
    implementation,
  ]);

  // Deploy the ERC1967 Proxy, pointing to the implementation
  const proxy = builder.contract("ERC1967Proxy", [implementation, initialize]);

  return { proxy };
});

export const RocketPoolVaultModule = buildModule("RocketPoolVaultModule", (builder) => {
  // Get the proxy from the previous module.
  const { proxy } = builder.useModule(ProxyModule);

  // Create a contract instance using the deployed proxy's address.
  const instance = builder.contractAt("RocketPoolVault", proxy);

  return { instance, proxy };
});

export default RocketPoolVaultModule;
