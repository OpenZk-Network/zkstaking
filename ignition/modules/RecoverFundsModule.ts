import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const RecoverFundsModule = buildModule("RecoverFundsModule", (m) => {
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


  const RecoverFunds = m.contract("RecoverFunds");

  return { RecoverFunds };
});

export default RecoverFundsModule;
