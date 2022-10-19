import hre, { deployments } from 'hardhat';
import { Deployment } from 'hardhat-deploy/types';

async function main() {
  const { get } = deployments;

  const dnGmxJuniorVaultManagerLibrary = await hreVerify('DnGmxJuniorVaultManagerLibrary');
  const logicLibrary = await hreVerify('LogicLibrary', {
    libraries: {
      DnGmxJuniorVaultManager: dnGmxJuniorVaultManagerLibrary.address,
    },
  });

  await hreVerify('CurveYieldStrategyLogic', {
    libraries: {
      DnGmxJuniorVaultManager: dnGmxJuniorVaultManagerLibrary.address,
      Logic: logicLibrary.address,
    },
  });

  await hreVerify('CurveYieldStrategy');

  await hreVerify('VaultPeriphery');

  // helper method that verify a contract and returns the deployment
  async function hreVerify(label: string, taskArguments: any = {}): Promise<Deployment> {
    console.log('verifying:', label);

    const deployment = await get(label);
    taskArguments = { address: deployment.address, ...taskArguments };

    // try to verify on etherscan
    try {
      await hre.run('verify:verify', taskArguments);
    } catch (err: any) {
      console.log(err);
    }
    return deployment;
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
