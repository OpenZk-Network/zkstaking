import {ethers, upgrades} from "hardhat";
import {expect} from "chai";
import {LiquidityManager, MockBridgeHub, MocksUSDSVault} from "../typechain-types";
import {EventLog, ZeroAddress} from "ethers";
import { setBalance } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("BridgeMiddleware",  () => {
  let owner, withdrawer, user, other, modifier, upgrader;
  let nativeToken, usdsToken, dummyToken;
  let liquidityManagerMock: LiquidityManager;
  let ozUSDVaultMock: MocksUSDSVault;
  let bridgeHubMock: MockBridgeHub;
  let bridgeMiddleware;
  let univ3router;
  const chainId = 1;


  beforeEach(async function () {
    [owner, withdrawer, user, other, modifier, upgrader] = await ethers.getSigners();

    // Deploy mock ERC20 tokens for native coin and the asset (e.g. DAI)
    nativeToken = await (await ethers.getContractFactory("MockERC20")).deploy("Native Token", "NAT");
    usdsToken = await (await ethers.getContractFactory("MockERC20")).deploy("USDS Token", "USDS");

    // Also deploy a dummy token (for testing the swap branch)
    // Also deploy a dummy token (for testing the swap branch)
    dummyToken = await (await ethers.getContractFactory("MockERC20")).deploy("Dummy Token", "DUM");

    // Deploy LiquidityManagerMock – it will simulate staking by transferring a preset amount of native tokens
    liquidityManagerMock = await (await ethers.getContractFactory("LiquidityManager")).deploy(nativeToken.target, owner.address);

    await liquidityManagerMock.connect(owner).grantRole(await liquidityManagerMock.MODIFIER_ROLE(), modifier.address);

    const chainlinkOracle = await (await ethers.getContractFactory("ChainlinkOracle")).deploy("0x536218f9E9Eb48863970252233c8F271f554C2d0");
    const swapRouter = await ethers.getContractAt("ISwapRouter", "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45");
    const mockRewardsCoordinator = await (await ethers.getContractFactory("MockRewardsCoordinator")).deploy();
    const eigenLayerVault = await upgrades.deployProxy(await ethers.getContractFactory("EigenLayerRETHVault"), [500, "OZ rETH", "ozrETH", owner.address, upgrader.address], {
      kind: "uups",
      constructorArgs: [chainlinkOracle.target, liquidityManagerMock.target, swapRouter.target, mockRewardsCoordinator.target]
    });
    await eigenLayerVault.waitForDeployment();
    await liquidityManagerMock.connect(modifier).addVault(eigenLayerVault.target, 10);

    // Deploy ozUSDVault – it uses assetToken as its underlying asset.
    ozUSDVaultMock = await (await ethers.getContractFactory("MocksUSDSVault")).deploy(usdsToken.target);

    // Deploy bridgeHubMock – it will let us simulate returning a canonical transaction hash and a base cost.
    bridgeHubMock = await (await ethers.getContractFactory("MockBridgeHub")).deploy();
    await bridgeHubMock.setSharedBridge(upgrader.address);

    const univ3router = await (await ethers.getContractFactory("MockSwapRouter")).deploy();

    // Deploy the BridgeMiddleware contract
    const BridgeMiddleware = await ethers.getContractFactory("BridgeMiddleware");
    bridgeMiddleware = await BridgeMiddleware.deploy(
      nativeToken.target,
      chainId,
      bridgeHubMock.target,
      owner.address,       // admin
      withdrawer.address,  // withdrawer
      liquidityManagerMock.target,
      ozUSDVaultMock.target,
      univ3router.target
    );
  });

  describe("Constructor and Roles", function () {
    it("should set roles correctly", async function () {
      const DEFAULT_ADMIN_ROLE = await bridgeMiddleware.DEFAULT_ADMIN_ROLE();
      const WITHDRAW_ROLE = await bridgeMiddleware.WITHDRAW_ROLE();
      const OPERATOR_ROLE = await bridgeMiddleware.OPERATOR_ROLE();

      expect(await bridgeMiddleware.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await bridgeMiddleware.hasRole(WITHDRAW_ROLE, withdrawer.address)).to.be.true;
      expect(await bridgeMiddleware.hasRole(WITHDRAW_ROLE, owner.address)).to.be.true;
      expect(await bridgeMiddleware.hasRole(OPERATOR_ROLE, owner.address)).to.be.true;
    });

    it("should allow the ozUSDVault usds token by default", async function () {
      expect(await bridgeMiddleware.isAllowedToken(usdsToken.target)).to.be.true;
    });
  });

  describe("stakeAndBridge", function () {
    it("should stake native and bridge successfully", async function () {
      const l2GasLimit = 1000;
      const stakeAmount = ethers.parseEther("1");
      const canonicalTxHash: any = "0x1234000000000000000000000000000000000000000000000000000000000000";

      // Simulate bridgeHub returning a dummy canonical transaction hash.
      await bridgeHubMock.setCanonicalTxHash(canonicalTxHash);

      // Call stakeAndBridge. (Note: msg.value is passed along.)
      await expect(bridgeMiddleware.connect(user).stakeAndBridge(l2GasLimit, { value: stakeAmount }))
        .to.emit(bridgeMiddleware, "StakeAndBridge")
        .withArgs(ZeroAddress, stakeAmount, 0, l2GasLimit, 800, stakeAmount)
        .to.emit(bridgeMiddleware, "CanonicalTxHash")
        .withArgs(canonicalTxHash)
        .to.emit(bridgeMiddleware, "ShareMinted")
        .withArgs(user.address, stakeAmount, stakeAmount);
    });
  });

  describe("stakeAndBridgeStable", function () {
    const l2GasLimit = 1000;
    const amount = ethers.parseEther("1");
    const canonicalTxHash: any = "0x1234000000000000000000000000000000000000000000000000000000000000";

    it("should revert if token is not allowed", async function () {
      const l2GasLimit = 1000;
      const amount = ethers.parseEther("1");

      // Disallow the usdsToken explicitly.
      await bridgeMiddleware.connect(owner).allowToken(usdsToken.target, false);

      // Expect the call to revert because the token is not allowed.
      await expect(
        bridgeMiddleware.connect(user).stakeAndBridgeStable(usdsToken.target, amount, l2GasLimit, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("BridgeWrap: token not allowed");
    });

    it("should perform stable staking and bridging using the usds token", async function () {
      // Use assetToken (which is allowed by default) for stable staking.
      // Transfer some assetToken to the user and approve the BridgeMiddleware contract.
      await usdsToken.mint(user.address, amount);
      await usdsToken.connect(user).approve(bridgeMiddleware.target, amount);

      // Simulate bridgeHub returning a canonical tx hash.
      await bridgeHubMock.setCanonicalTxHash(canonicalTxHash);
      const txCost: any = ethers.parseEther("0.001");
      await bridgeHubMock.setl2TransactionBaseCost(txCost);
      const userBalance1 =  await ethers.provider.getBalance(user.address);

      // Call stakeAndBridgeStable. We send extra ETH so that any gas refund can be issued.
      const tx = await bridgeMiddleware.connect(user).stakeAndBridgeStable(usdsToken.target, amount, l2GasLimit, { value: ethers.parseEther("2") });
      const receipt = await tx.wait();
      let log: any[] = [];
      for (const eventLog: EventLog of receipt.logs) {
        if (eventLog.eventName === 'StakeAndBridge') {
          log = eventLog.args;
        }
      }
      expect(log.length).to.equal(6);
      expect(log[0]).to.equal(usdsToken.target);
      expect(log[1]).to.equal(amount);
      expect(log[2]).to.equal(amount * BigInt(95) / BigInt(100));
      expect(log[3]).to.equal(l2GasLimit);
      expect(log[4]).to.equal(800);
      expect(log[5]).to.equal(txCost);

      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const userBalance2 = await ethers.provider.getBalance(user.address);
      expect(userBalance1 - txCost - gasCost).to.equal(userBalance2);
    });

    it("should perform stable staking and bridging using the another allowed token", async function () {
      await dummyToken.mint(user.address, amount);
      await dummyToken.connect(user).approve(bridgeMiddleware.target, amount);
      await bridgeMiddleware.allowToken(dummyToken.target, true);

      // Simulate bridgeHub returning a canonical tx hash.
      await bridgeHubMock.setCanonicalTxHash(canonicalTxHash);
      const txCost: any = ethers.parseEther("0.001");
      await bridgeHubMock.setl2TransactionBaseCost(txCost);
      const userBalance1 =  await ethers.provider.getBalance(user.address);

      // Call stakeAndBridgeStable. We send extra ETH so that any gas refund can be issued.
      const tx = await bridgeMiddleware.connect(user).stakeAndBridgeStable(dummyToken.target, amount, l2GasLimit, { value: ethers.parseEther("2") });
      const receipt = await tx.wait();
      let log: any[] = [];
      for (const eventLog: EventLog of receipt.logs) {
        if (eventLog.eventName === 'StakeAndBridge') {
          log = eventLog.args;
        }
      }
      const swappedAmount = amount * BigInt(99) / BigInt(100)
      expect(log.length).to.equal(6);
      expect(log[0]).to.equal(dummyToken.target);
      expect(log[1]).to.equal(swappedAmount );
      expect(log[2]).to.equal(swappedAmount * BigInt(95) / BigInt(100));
      expect(log[3]).to.equal(l2GasLimit);
      expect(log[4]).to.equal(800);
      expect(log[5]).to.equal(txCost);

      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const userBalance2 = await ethers.provider.getBalance(user.address);
      expect(userBalance1 - txCost - gasCost).to.equal(userBalance2);
    });
  });

  describe("Access Control and Utility Functions", () => {
    describe("allowToken", () => {
      it("should only allow an account with OPERATOR_ROLE to change token allowance", async () => {
        // Try to allow a dummy token from a non-operator account (user)
        await expect(
          bridgeMiddleware.connect(user).allowToken(dummyToken.target, true)
        ).to.be.reverted; // reverts with AccessControl error

        // Allow the token from the operator (owner, who holds the role)
        await expect(bridgeMiddleware.connect(owner).allowToken(dummyToken.target, true))
          .to.emit(bridgeMiddleware, "TokenAllowed")
          .withArgs(dummyToken.target, true);

        // Verify that the token is marked as allowed
        expect(await bridgeMiddleware.isAllowedToken(dummyToken.target)).to.be.true;
      });
    });

    describe("sweepTokens", () => {
      it("should allow only an account with WITHDRAW_ROLE to sweep tokens", async () => {
        const amount = ethers.parseEther("10");

        // Transfer some native tokens to the BridgeMiddleware contract
        await nativeToken.mint(bridgeMiddleware.target, amount);

        // A non-withdrawer (user) should not be able to sweep tokens
        await expect(
          bridgeMiddleware.connect(user).sweepTokens(nativeToken.target, user.address)
        ).to.be.reverted;

        // The withdrawer should sweep tokens successfully
        await expect(
          bridgeMiddleware.connect(withdrawer).sweepTokens(nativeToken.target, withdrawer.address)
        )
          .to.emit(bridgeMiddleware, "Swept")
          .withArgs(nativeToken.target, withdrawer.address);

        // Verify the withdrawer's balance increased by the swept amount
        expect(await nativeToken.balanceOf(withdrawer.address)).to.equal(amount);
      });
    });

    describe("recoverEth", () => {
      it("should allow only an account with WITHDRAW_ROLE to recover ETH", async () => {
        const ethAmount = ethers.parseEther("1");

        // Send ETH to the BridgeMiddleware contract
        await setBalance(bridgeMiddleware.target, ethAmount);

        // A non-withdrawer (user) should not be able to recover ETH
        await expect(
          bridgeMiddleware.connect(user).recoverEth()
        ).to.be.reverted;

        // Record withdrawer's balance before recovery
        const balanceBefore = await ethers.provider.getBalance(withdrawer.address);

        // The withdrawer recovers ETH
        const tx = await bridgeMiddleware.connect(withdrawer).recoverEth();
        const receipt = await tx.wait();
        // (Event Swept is emitted with address(0) indicating ETH)
        await expect(tx)
          .to.emit(bridgeMiddleware, "Swept")
          .withArgs(ZeroAddress, withdrawer.address);

        // Check that withdrawer's balance increases (accounting for gas cost)
        const balanceAfter = await ethers.provider.getBalance(withdrawer.address);
        expect(balanceAfter).to.be.gt(balanceBefore);
      });
    });

    describe("L2 Transaction Cost Functions", () => {
      it("should return the correct l2TransactionBaseCost from the bridgeHub", async () => {
        const l1GasPrice = ethers.parseUnits("100", "gwei");
        const l2GasLimit = 1000;
        const l2GasPerPubdataByteLimit = 800;

        // Set the base cost in bridgeHubMock
        const baseCost: any = ethers.parseEther("0.01");
        await bridgeHubMock.setl2TransactionBaseCost(baseCost);

        const returnedCost = await bridgeMiddleware.l2TransactionBaseCost(
          l1GasPrice,
          l2GasLimit,
          l2GasPerPubdataByteLimit
        );
        expect(returnedCost).to.equal(baseCost);
      });

      it("should calculate l2TransactionEthCost correctly when liquidityManager virtual balance is zero", async () => {
        const l1GasPrice = ethers.parseUnits("100", "gwei");
        const l2GasLimit = 1000;
        const l2GasPerPubdataByteLimit = 800;

        const baseCost: any = ethers.parseEther("0.01");
        await bridgeHubMock.setl2TransactionBaseCost(baseCost);

        const ethCost = await bridgeMiddleware.l2TransactionEthCost.staticCall(
          l1GasPrice,
          l2GasLimit,
          l2GasPerPubdataByteLimit
        );
        // When virtual balance is zero, _convertToEthAmount returns the base amount unchanged
        expect(ethCost).to.equal(baseCost);
      });

      it("should calculate l2TransactionEthCost correctly when liquidityManager virtual balance is nonzero", async () => {
        const l1GasPrice = ethers.parseUnits("100", "gwei");
        const l2GasLimit = 1000;
        const l2GasPerPubdataByteLimit = 800;

        const baseCost: any = ethers.parseEther("0.01");
        await bridgeHubMock.setl2TransactionBaseCost(baseCost);

        await bridgeMiddleware.connect(user).stakeAndBridge(l2GasLimit, { value: ethers.parseEther("1") });

        // Retrieve the native token's total supply
        const nativeSupply = await nativeToken.totalSupply();

        // Expected conversion based on:
        // _convertToEthAmount = baseCost * virtualBalance * 1_000_000 / (nativeSupply * 950_000)
        const virtualBalance = await liquidityManagerMock.virtualBalance.staticCall();
        const expectedEthCost = baseCost * virtualBalance * BigInt(1000000) / (nativeSupply * BigInt(950000));

        const ethCost = await bridgeMiddleware.l2TransactionEthCost.staticCall(
          l1GasPrice,
          l2GasLimit,
          l2GasPerPubdataByteLimit
        );
        expect(ethCost).to.equal(expectedEthCost);
      });
    });
  });
});