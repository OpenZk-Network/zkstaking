import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ChainlinkOracleModule = buildModule("ChainlinkOracleModule", (m) => {
  const priceFeedAddress = "0x536218f9E9Eb48863970252233c8F271f554C2d0";
  const oracle = m.contract("ChainlinkOracle", [priceFeedAddress], {});

  return { oracle };
});

export default ChainlinkOracleModule;
