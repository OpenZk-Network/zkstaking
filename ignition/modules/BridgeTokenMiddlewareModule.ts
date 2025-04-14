import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const BridgeTokenMiddlewareModule = buildModule("BridgeTokenMiddlewareModule", (m) => {

  const nativeCoinAddress = "0x03F5BE358fc2C4DF88723a63148bd829B8AA5c91";
  const chainId = "1345";
  const bridgeHubAddress = "0x303a465b659cbb0ab36ee643ea362c509eeb5213";
  const admin = "0x1c2Cc2428736971cEa04859c9B96F6b63D7110aE";
  const liquidityManager = "0x1c21d5B5bd5d2b859D1D5B12Fd72db5ff7e98E92";

  const bridgeTokenMiddleware = m.contract("BridgeTokenMiddleware",
    [
      nativeCoinAddress,
      chainId,
      bridgeHubAddress,
      admin,
      liquidityManager,
    ], {});

  return { bridgeTokenMiddleware };
});

export default BridgeTokenMiddlewareModule;
