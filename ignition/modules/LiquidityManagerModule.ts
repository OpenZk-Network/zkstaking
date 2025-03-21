// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LiquidityManagerModule = buildModule("LiquidityManagerModule", (m) => {
  const underlying = "0x03F5BE358fc2C4DF88723a63148bd829B8AA5c91";
  const defaultAdmin = "0xd25D9f25899B3DFf18A9A37459A7C75d8c89a7c9";
  const lm = m.contract("LiquidityManager", [underlying, defaultAdmin], {});

  return { lm };
});

export default LiquidityManagerModule;
