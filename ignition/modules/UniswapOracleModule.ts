import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const UniswapOracleModule = buildModule("UniswapOracleModule", (m) => {
  const fee = 3000;
  const oracle = m.contract("UniswapOracle", [fee], {});

  return { oracle };
});

export default UniswapOracleModule;
