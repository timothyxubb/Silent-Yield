import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("SilentYieldSepolia", function () {
  let signers: Signers;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  it("reads deployed contracts", async function () {
    const silentYieldDeployment = await deployments.get("SilentYield");
    const silentYield = await ethers.getContractAt("SilentYield", silentYieldDeployment.address);

    const yieldTokenAddress = await silentYield.yieldToken();
    expect(yieldTokenAddress).to.not.eq(ethers.ZeroAddress);

    const encryptedStake = await silentYield.encryptedStakeOf(signers.alice.address);
    expect(ethers.isHexString(encryptedStake, 32)).to.eq(true);
  });
});
