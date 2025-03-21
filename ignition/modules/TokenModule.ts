import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TokenModule = buildModule("Token", (m) => {
  const token = m.contract("Token", ["ozETH", "ozETH"], {});

  return { token };
});

export default TokenModule;
