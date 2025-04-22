import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ozETHModule = buildModule("wozETH", (m) => {
  const token = m.contract("wozETH", []);

  return { token };
});

export default ozETHModule;
