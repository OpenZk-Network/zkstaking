import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ozETHModule = buildModule("ozETH", (m) => {
  // const initial: bigint = ethers.parseUnits("1", 18);
  const defaultAdmin = "0xeAb944be4F5898EAAfD5b1c21D1CD2Ec9ED55b5c";
  const token = m.contract("ozETH", [defaultAdmin]);

  return { token };
});

export default ozETHModule;
