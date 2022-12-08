import hre, { deployments } from 'hardhat';
import { Deployment } from 'hardhat-deploy/types';
import { getNetworkInfo } from '../deploy/network-info';
import {
  DnGmxBatchingManager__factory,
  DnGmxJuniorVault__factory,
  DnGmxSeniorVault__factory,
} from '../typechain-types';

async function main() {
  const { get } = deployments;

  const ni = await getNetworkInfo();

  const ProxyAdmin = await hreVerify('ProxyAdmin');

  const DnGmxJuniorVaultManagerLibrary = await hreVerify('DnGmxJuniorVaultManagerLibrary');
  const DnGmxJuniorVaultLogic = await hreVerify('DnGmxJuniorVaultLogic', {
    libraries: {
      DnGmxJuniorVaultManager: DnGmxJuniorVaultManagerLibrary.address,
    },
  });
  const DnGmxSeniorVaultLogic = await hreVerify('DnGmxSeniorVaultLogic');
  const DnGmxBatchingManager = await hreVerify('DnGmxBatchingManager');

  const DnGmxJuniorVault = await hreVerify('DnGmxJuniorVault', {
    constructorArguments: [
      DnGmxJuniorVaultLogic.address,
      ProxyAdmin.address,
      DnGmxJuniorVault__factory.createInterface().encodeFunctionData('initialize', [
        'Delta Netural GMX Vault (Junior)', // _name
        'DN_GMX_JUNIOR', // _symbol
        ni.UNI_V3_SWAP_ROUTER,
        ni.GMX_REWARD_ROUTER,
        ni.GMX_MINT_BURN_REWARD_ROUTER,
        {
          weth: ni.WETH_ADDRESS,
          wbtc: ni.WBTC_ADDRESS,
          sGlp: ni.GMX_SGLP_ADDRESS,
          usdc: ni.USDC_ADDRESS,
        },
        ni.AAVE_POOL_ADDRESS_PROVIDER,
      ]),
    ],
  });

  await hreVerify('DnGmxSeniorVault', {
    constructorArguments: [
      DnGmxSeniorVaultLogic.address,
      ProxyAdmin.address,
      DnGmxSeniorVault__factory.createInterface().encodeFunctionData('initialize', [
        ni.USDC_ADDRESS,
        'Delta Netural GMX Vault (Senior)',
        'DN_GMX_SENIOR',
        ni.AAVE_POOL_ADDRESS_PROVIDER,
      ]),
    ],
  });

  await hreVerify('DnGmxBatchingManager', {
    constructorArguments: [
      DnGmxBatchingManager.address,
      ProxyAdmin.address,
      DnGmxBatchingManager__factory.createInterface().encodeFunctionData('initialize', [
        ni.GMX_SGLP_ADDRESS,
        ni.USDC_ADDRESS,
        ni.GMX_REWARD_ROUTER,
        ni.GLP_MANAGER,
        DnGmxJuniorVault.address,
        ni.KEEPER_BATCHING_MANAGER,
      ]),
    ],
  });

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
