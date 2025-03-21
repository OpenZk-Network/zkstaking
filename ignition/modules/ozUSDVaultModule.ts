import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ozUSDVaultModule = buildModule("ozUSDVault", (m) => {

  const underlying = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const owner = "0xeAb944be4F5898EAAfD5b1c21D1CD2Ec9ED55b5c";
  const svault = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD";
  const converter = "0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A";
  const v3router = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

  const vault = m.contract("ozUSDVault", [underlying, owner, 100n, svault, converter, v3router], { });

  return { vault };
});

export default ozUSDVaultModule;
