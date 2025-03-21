import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const BridgeMiddlewareSepoliaModule = buildModule("BridgeMiddlewareSepoliaModule", (m) => {
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
  const nativeCoinAddress = "0x02882801BA927bcA395c16C07cC63a0ED1d74eD7"; // ozk on sepolia / ozETH on ethereum mainnet
  const chainId = "4681"; // layer 2 chain id
  const bridgeHubAddress = "0x35A54c8C757806eB6820629bc82d90E056394C92"; // layer 2 chain id
  const admin = m.getAccount(0);
  const withdrawer = m.getAccount(0);
  const liquidityManager = m.contract("MockLiquidityManagerBridgeWrapper", [], {});
  const skyMoneyVault = "0xE26bE9a567175d3EaBD4f6Bcbf88C30b707Fa630";


  const bridgeMiddlewareSepolia = m.contract("BridgeMiddleware",
    [
      nativeCoinAddress,
      chainId,
      bridgeHubAddress,
      admin,
      withdrawer,
      liquidityManager,
      skyMoneyVault
    ], {});

  return { bridgeMiddlewareSepolia };
});

export default BridgeMiddlewareSepoliaModule;
