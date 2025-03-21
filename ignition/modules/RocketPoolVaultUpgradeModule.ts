import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const oracle = "0x025E9049A9289c64E12F47D17449AA884D648F7B"; // Chainlink Oracle
const liquidityManager = "0x137124b4cb0e4B449D2472D8103417dAb526eBD2";
const v3Router = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

// Module for the new implementation
const UpgradeModule = buildModule("UpgradeModule", (builder) => {
  // Deploy the new implementation contract
  const newImplementation = builder.contract("RocketPoolVault", [oracle, liquidityManager, v3Router], {});
  return { newImplementation };
});

// Module to perform the upgrade - removed async keyword
export const RocketPoolVaultUpgradeModule = buildModule("RocketPoolVaultUpgradeModule", (builder) => {
  // Get the proxy from the original deployment
  // const { proxy } = builder.useModule(ProxyModule);
  const EXISTING_PROXY_ADDRESS = "0x7da40ecA2c9fa68735f0D5F665a7d85f33D83a3f";
  const proxyInstance = builder.contractAt("RocketPoolVault", EXISTING_PROXY_ADDRESS);
  
  // Get the new implementation
  const { newImplementation } = builder.useModule(UpgradeModule);
  
  // Upgrade the implementation
  builder.call(proxyInstance, "upgradeToAndCall", [newImplementation, "0x"]);
  
  // Return both the proxy and new implementation addresses
  return { 
    proxyInstance,
    newImplementation
  };
});

export default RocketPoolVaultUpgradeModule;