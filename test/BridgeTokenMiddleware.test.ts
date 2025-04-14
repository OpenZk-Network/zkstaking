import {ethers, upgrades} from "hardhat";
import {BridgeTokenMiddleware, LiquidityManager, MockBridgeHub, MockERC20} from "../typechain-types";
import {expect} from "chai";

describe('BridgeTokenMiddleware', () => {
  let owner, user, modifier, upgrader, other;
  let nativeToken: MockERC20;
  let allowedToken: MockERC20;
  let liquidityManagerMock: LiquidityManager;
  let bridgeHubMock: MockBridgeHub;
  let bridgeTokenMiddleware: BridgeTokenMiddleware;

  beforeEach(async function () {
    [owner, user, modifier, upgrader, other] = await ethers.getSigners();

    nativeToken = await (await ethers.getContractFactory("MockERC20")).deploy("Native Token", "NAT");
    allowedToken = await (await ethers.getContractFactory("MockERC20")).deploy("Allowed Token", "ATK");
    liquidityManagerMock = await (await ethers.getContractFactory("LiquidityManager")).deploy(nativeToken.target, owner.address);

    await liquidityManagerMock.connect(owner).grantRole(await liquidityManagerMock.MODIFIER_ROLE(), modifier.address);
    await allowedToken.mint(user.address, ethers.parseEther('100'));

    const chainlinkOracle = await (await ethers.getContractFactory("ChainlinkOracle")).deploy("0x536218f9E9Eb48863970252233c8F271f554C2d0");
    const swapRouter = await ethers.getContractAt("ISwapRouter", "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45");
    const mockRewardsCoordinator = await (await ethers.getContractFactory("MockRewardsCoordinator")).deploy();
    const eigenLayerVault = await upgrades.deployProxy(await ethers.getContractFactory("EigenLayerRETHVault"), [500, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
      kind: "uups",
      constructorArgs: [chainlinkOracle.target, liquidityManagerMock.target, swapRouter.target, mockRewardsCoordinator.target]
    });
    await eigenLayerVault.waitForDeployment();
    await liquidityManagerMock.connect(modifier).addVault(eigenLayerVault.target, 10);

    bridgeHubMock = await (await ethers.getContractFactory("MockBridgeHub")).deploy();
    await bridgeHubMock.setSharedBridge(upgrader.address);

    const bridgeTokenMiddlewareFactory = await ethers.getContractFactory("BridgeTokenMiddleware");
    bridgeTokenMiddleware = await bridgeTokenMiddlewareFactory.deploy(
      nativeToken.target,
      1,
      bridgeHubMock.target,
      owner.address,       // admin
      liquidityManagerMock.target,
    );
    await bridgeTokenMiddleware.allowTokens([allowedToken.target]);
  });

  describe('allowTokens', () => {
    it('Should be called only by operator', async () => {
     await expect(bridgeTokenMiddleware.connect(other).allowTokens([allowedToken.target]))
       .to.be.revertedWithCustomError(bridgeTokenMiddleware, 'AccessControlUnauthorizedAccount');

     await expect(bridgeTokenMiddleware.connect(owner).allowTokens([allowedToken.target]))
       .to.emit(bridgeTokenMiddleware, 'TokenSupported')
       .withArgs(allowedToken.target, true);

     expect(await bridgeTokenMiddleware.isAllowedToken(allowedToken.target)).to.be.true;
    });
  });

  describe('disableTokens', () => {
    it('Should be called only by operator', async () => {
      await expect(bridgeTokenMiddleware.connect(other).disableTokens([allowedToken.target]))
        .to.be.revertedWithCustomError(bridgeTokenMiddleware, 'AccessControlUnauthorizedAccount');

      await bridgeTokenMiddleware.connect(owner).allowTokens([allowedToken.target]);
      await expect(bridgeTokenMiddleware.connect(owner).disableTokens([allowedToken.target]))
        .to.emit(bridgeTokenMiddleware, 'TokenSupported')
        .withArgs(allowedToken.target, false);

      expect(await bridgeTokenMiddleware.isAllowedToken(allowedToken.target)).to.be.false;
    });
  });

  describe('bridgeToken', () => {
    it('Fails for unsupported token', async () => {
      expect(bridgeTokenMiddleware.bridgeToken(other.address)).to.be.revertedWith('BridgeWrap: token not supported');
    });

    it('Should bridge token', async () => {
      const tokenAmount = ethers.parseEther('10');
      const gasLimit = 1000;
      const bridgeHubTxCost = await bridgeHubMock.l2TransactionBaseCostValue();
      await allowedToken.connect(user).approve(bridgeTokenMiddleware.target, tokenAmount);
      const ethAmount = ethers.parseEther('0.01');
      const initialBalance = await ethers.provider.getBalance(user.address);
      const tx = await bridgeTokenMiddleware.connect(user).bridgeToken(
        allowedToken.target,
        tokenAmount,
        gasLimit,
        { value: ethAmount }
      );
      await expect(tx)
        .to.emit(bridgeTokenMiddleware, 'BridgeToken').withArgs(allowedToken.target, tokenAmount, gasLimit, 800, bridgeHubTxCost)
        .to.emit(bridgeTokenMiddleware, 'ShareMinted').withArgs(user.address, bridgeHubTxCost, bridgeHubTxCost);

      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed;
      const gasPrice = tx.gasPrice;
      const txCost = gasUsed * gasPrice;

      const finalBalance = await ethers.provider.getBalance(user.address);
      expect(initialBalance - finalBalance).to.equal(bridgeHubTxCost + txCost);
      expect(await ethers.provider.getBalance(bridgeTokenMiddleware.target)).to.equal(0);
    });
  });
});