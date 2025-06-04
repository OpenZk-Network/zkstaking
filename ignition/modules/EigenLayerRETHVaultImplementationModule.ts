import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const oracle = "0x114d35AB3BE9Aa7E9F22aC5b79C710d379b4CdE7"; // Chainlink Oracle
const liquidityManager = "0x1c21d5B5bd5d2b859D1D5B12Fd72db5ff7e98E92";
const v3Router = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const rewardsCoordinator = "0x7750d328b314EfFa365A0402CcfD489B80B0adda";

export const EigenLayerRETHVaultImplementationModule = buildModule("EigenLayerRETHVaultImplementationModule", (builder) => {
  // Get the proxy from the previous module.

  // Create a contract instance using the deployed proxy's address.
  const implementation = builder.contract("EigenLayerRETHVault", [oracle, liquidityManager, v3Router, rewardsCoordinator], {});

  return { implementation };
});

export default EigenLayerRETHVaultImplementationModule;