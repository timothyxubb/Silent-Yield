import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy,read,execute } = hre.deployments;

  const deployedYieldCoin = await deploy("ConfidentialYieldCoin", {
    from: deployer,
    log: true,
    args: [deployer],
  });

  const deployedSilentYield = await deploy("SilentYield", {
    from: deployer,
    log: true,
    args: [deployedYieldCoin.address],
  });

  const currentMinter = (await read("ConfidentialYieldCoin", "minter")) as string;
  if (currentMinter.toLowerCase() !== deployedSilentYield.address.toLowerCase()) {
    await execute("ConfidentialYieldCoin", { from: deployer, log: true }, "setMinter", deployedSilentYield.address);
  }

  console.log(`ConfidentialYieldCoin contract: `, deployedYieldCoin.address);
  console.log(`SilentYield contract: `, deployedSilentYield.address);
};
export default func;
func.id = "deploy_silent_yield";
func.tags = ["SilentYield", "ConfidentialYieldCoin"];
