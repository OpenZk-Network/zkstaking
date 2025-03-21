import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const oracle = "0x114d35AB3BE9Aa7E9F22aC5b79C710d379b4CdE7"; // Chainlink Oracle
const liquidityManager = "0x1c21d5B5bd5d2b859D1D5B12Fd72db5ff7e98E92";
const v3Router = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const rewardsCoordinator = "0x7750d328b314EfFa365A0402CcfD489B80B0adda";

const ProxyModule = buildModule("ProxyModule", (builder) => {
  // Deploy the implementation contract
  const implementation = builder.contract("EigenLayerRETHVault", [oracle, liquidityManager, v3Router, rewardsCoordinator], {});

  // Encode the initialize function call for the contract.
  const initialize = builder.encodeFunctionCall(implementation, "initialize", [
    "500", // fee
    "OZ rETH",
    "ozrETH",
    "0xd25D9f25899B3DFf18A9A37459A7C75d8c89a7c9", // admin
    implementation,
  ]);

  // Deploy the ERC1967 Proxy, pointing to the implementation
  const proxy = builder.contract("ERC1967Proxy", [implementation, initialize]);

  return { proxy };
});

export const EigenLayerRETHVaultModule = buildModule("EigenLayerRETHVaultModule", (builder) => {
  // Get the proxy from the previous module.
  const { proxy } = builder.useModule(ProxyModule);

  // Create a contract instance using the deployed proxy's address.
  const instance = builder.contractAt("EigenLayerRETHVault", proxy);

  return { instance, proxy };
});

export default EigenLayerRETHVaultModule;