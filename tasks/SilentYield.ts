import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ==========================================================
 *
 * 1. From a separate terminal window:
 *
 *   npx hardhat node
 *
 * 2. Deploy contracts
 *
 *   npx hardhat --network localhost deploy
 *
 * 3. Interact with SilentYield
 *
 *   npx hardhat --network localhost task:address
 *   npx hardhat --network localhost task:stake --amount 1
 *   npx hardhat --network localhost task:decrypt-stake
 *   npx hardhat --network localhost task:claim-yield
 *   npx hardhat --network localhost task:decrypt-yield
 *   npx hardhat --network localhost task:withdraw --amount 0.5
 *
 * Tutorial: Deploy and Interact on Sepolia (--network sepolia)
 * ===========================================================
 *
 * 1. Deploy contracts
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Interact with SilentYield
 *
 *   npx hardhat --network sepolia task:address
 *   npx hardhat --network sepolia task:stake --amount 0.1
 *   npx hardhat --network sepolia task:decrypt-stake
 */

/**
 * Example:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the SilentYield and ConfidentialYieldCoin addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const silentYield = await deployments.get("SilentYield");
    const yieldCoin = await deployments.get("ConfidentialYieldCoin");

    console.log("SilentYield address is " + silentYield.address);
    console.log("ConfidentialYieldCoin address is " + yieldCoin.address);
  },
);

/**
 * Example:
 *   - npx hardhat --network localhost task:stake --amount 1
 */
task("task:stake", "Stakes ETH into SilentYield")
  .addParam("amount", "Amount in ETH")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const silentYield = await deployments.get("SilentYield");
    const signer = (await ethers.getSigners())[0];

    const amount = ethers.parseEther(taskArguments.amount);

    const silentYieldContract = await ethers.getContractAt("SilentYield", silentYield.address);
    const tx = await silentYieldContract.connect(signer).stake({ value: amount });
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:claim-yield
 */
task("task:claim-yield", "Claims yield in cYieldCoin")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const silentYield = await deployments.get("SilentYield");
    const signer = (await ethers.getSigners())[0];

    const silentYieldContract = await ethers.getContractAt("SilentYield", silentYield.address);
    const tx = await silentYieldContract.connect(signer).claimYield();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:withdraw --amount 0.25
 */
task("task:withdraw", "Withdraws ETH from SilentYield")
  .addParam("amount", "Amount in ETH")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const silentYield = await deployments.get("SilentYield");
    const signer = (await ethers.getSigners())[0];

    const amount = ethers.parseEther(taskArguments.amount);

    const silentYieldContract = await ethers.getContractAt("SilentYield", silentYield.address);
    const tx = await silentYieldContract.connect(signer).withdraw(amount);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-stake
 */
task("task:decrypt-stake", "Decrypts the caller's encrypted stake")
  .addOptionalParam("address", "Optionally specify the SilentYield contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const silentYieldDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("SilentYield");

    const signer = (await ethers.getSigners())[0];

    const silentYieldContract = await ethers.getContractAt("SilentYield", silentYieldDeployment.address);
    const encryptedStake = await silentYieldContract.encryptedStakeOf(signer.address);

    if (encryptedStake === ethers.ZeroHash) {
      console.log("Encrypted stake: 0x0");
      console.log("Clear stake: 0");
      return;
    }

    const clearStake = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedStake,
      silentYieldDeployment.address,
      signer,
    );

    console.log(`Encrypted stake: ${encryptedStake}`);
    console.log(`Clear stake: ${clearStake}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-yield
 */
task("task:decrypt-yield", "Decrypts the caller's cYieldCoin balance")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const silentYield = await deployments.get("SilentYield");
    const signer = (await ethers.getSigners())[0];

    const silentYieldContract = await ethers.getContractAt("SilentYield", silentYield.address);
    const yieldTokenAddress = await silentYieldContract.yieldToken();
    const yieldToken = await ethers.getContractAt("ConfidentialYieldCoin", yieldTokenAddress);

    const encryptedBalance = await yieldToken.confidentialBalanceOf(signer.address);

    if (encryptedBalance === ethers.ZeroHash) {
      console.log("Encrypted cYieldCoin balance: 0x0");
      console.log("Clear cYieldCoin balance: 0");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      yieldTokenAddress,
      signer,
    );

    console.log(`Encrypted cYieldCoin balance: ${encryptedBalance}`);
    console.log(`Clear cYieldCoin balance: ${clearBalance}`);
  });
