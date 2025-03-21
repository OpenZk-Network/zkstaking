import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SkyMoneyVaultSepoliaModule = buildModule("SkyMoneyVaultSepolia", (m) => {
  const usdsMock = m.contract("MockERC20", ["USDS", "USDS"], {id: "usdsmocksepolia"});
  const daiMock = m.contract("MockERC20", ["DAI", "DAI"], {id: "daimocksepolia"});
  const usdcMock = m.contract("MockERC20", ["USDC", "USDC"], {id: "usdcmocksepolia"});
  const usdtMock = m.contract("MockERC20", ["USDT", "USDT"], {id: "usdtmocksepolia"});
  const mockConverter = m.contract("MockConverter", [daiMock, usdsMock], {id: "mockconvertersepolia"});
  const mocksUSDSVault = m.contract("MocksUSDSVault", [usdsMock], {id: "mocksusdsvaultsepolia"});
  const mockSwapRouter = m.contract("MockSwapRouter", [], {id: "mockswaproutersepolia"});

  const vault = m.contract("SkyMoneyVault", [daiMock, m.getAccount(0), 100n, mocksUSDSVault, mockConverter, mockSwapRouter], {id: "skymoneyvaultsepolia"});

  return { vault, usdsMock, daiMock, usdtMock, mocksUSDSVault, usdcMock };
});

export default SkyMoneyVaultSepoliaModule;
