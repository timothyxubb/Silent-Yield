import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ConfidentialYieldCoin, ConfidentialYieldCoin__factory, SilentYield, SilentYield__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

const WEI_PER_ETH = 10n ** 18n;
const YIELD_PER_DAY_PER_ETH = 10n * 10n ** 6n;
const SECONDS_PER_DAY = 86400n;

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const yieldCoinFactory = (await ethers.getContractFactory(
    "ConfidentialYieldCoin",
  )) as ConfidentialYieldCoin__factory;
  const silentYieldFactory = (await ethers.getContractFactory("SilentYield")) as SilentYield__factory;

  const [deployer] = await ethers.getSigners();
  const yieldCoin = (await yieldCoinFactory.deploy(deployer.address)) as ConfidentialYieldCoin;
  const silentYield = (await silentYieldFactory.deploy(await yieldCoin.getAddress())) as SilentYield;

  await yieldCoin.setMinter(await silentYield.getAddress());

  return { yieldCoin, silentYield };
}

describe("SilentYield", function () {
  let signers: Signers;
  let yieldCoin: ConfidentialYieldCoin;
  let silentYield: SilentYield;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ yieldCoin, silentYield } = await deployFixture());
  });

  it("records an encrypted stake", async function () {
    const deposit = ethers.parseEther("1");
    await (await silentYield.connect(signers.alice).stake({ value: deposit })).wait();

    const encryptedStake = await silentYield.encryptedStakeOf(signers.alice.address);
    const clearStake = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedStake,
      await silentYield.getAddress(),
      signers.alice,
    );

    expect(clearStake).to.eq(deposit);
  });

  it("accrues yield over time", async function () {
    const deposit = ethers.parseEther("2");
    await (await silentYield.connect(signers.alice).stake({ value: deposit })).wait();

    const lastAccrual = await silentYield.lastAccrualAt(signers.alice.address);

    await ethers.provider.send("evm_increaseTime", [Number(SECONDS_PER_DAY)]);
    await ethers.provider.send("evm_mine", []);

    await (await silentYield.connect(signers.alice).claimYield()).wait();

    const latestBlock = await ethers.provider.getBlock("latest");
    const elapsed = BigInt((latestBlock?.timestamp ?? 0) - Number(lastAccrual));

    const expectedYield = (deposit * YIELD_PER_DAY_PER_ETH * elapsed) / (WEI_PER_ETH * SECONDS_PER_DAY);

    const encryptedBalance = await yieldCoin.confidentialBalanceOf(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      await yieldCoin.getAddress(),
      signers.alice,
    );

    expect(clearBalance).to.eq(expectedYield);
  });

  it("withdraws and updates encrypted stake", async function () {
    const deposit = ethers.parseEther("1.5");
    await (await silentYield.connect(signers.alice).stake({ value: deposit })).wait();

    const withdrawAmount = ethers.parseEther("0.4");
    await (await silentYield.connect(signers.alice).withdraw(withdrawAmount)).wait();

    const encryptedStake = await silentYield.encryptedStakeOf(signers.alice.address);
    const clearStake = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedStake,
      await silentYield.getAddress(),
      signers.alice,
    );

    expect(clearStake).to.eq(deposit - withdrawAmount);
  });
});
