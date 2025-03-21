import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const BridgeMiddlewareModule = buildModule("BridgeMiddlewareModule", (m) => {
  /**
   *     constructor (
   *         address _nativeCoin,
   *         uint256 _chainId,
   *         address _bridgehub,
   *         address _admin,
   *         address _withdrawer,
   *         address _liquidityManager,
   *         address _skyMoneyVault
   *     )
   */
  const nativeCoinAddress = "0x03F5BE358fc2C4DF88723a63148bd829B8AA5c91"; // ozk on sepolia / ozETH on ethereum mainnet
  const chainId = "1345"; // layer 2 chain id
  const bridgeHubAddress = "0x303a465b659cbb0ab36ee643ea362c509eeb5213"; // layer 2 chain id
  const admin = "0x1c2Cc2428736971cEa04859c9B96F6b63D7110aE";
  const withdrawer = "0x1c2Cc2428736971cEa04859c9B96F6b63D7110aE";
  const liquidityManager = "0x1c21d5B5bd5d2b859D1D5B12Fd72db5ff7e98E92";
  const ozUSDVault = "0x3B5cc7D992F8ED1b4E1f9F660984adCd61fC1aCa";


  const bridgeMiddleware = m.contract("BridgeMiddleware",
    [
      nativeCoinAddress,
      chainId,
      bridgeHubAddress,
      admin,
      withdrawer,
      liquidityManager,
      ozUSDVault
    ], {});

  return { bridgeMiddleware };
});

export default BridgeMiddlewareModule;
