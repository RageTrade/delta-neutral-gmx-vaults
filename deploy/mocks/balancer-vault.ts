import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { IBalancerVault__factory } from '../../typechain-types';
import { getNetworkInfo, waitConfirmations } from '../network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { BALANCER_VAULT } = await getNetworkInfo();
  if (BALANCER_VAULT) {
    await save('BalancerVault', { abi: IBalancerVault__factory.abi, address: BALANCER_VAULT });
    console.log('Skipping BalancerVaultMock deployment, using BalancerVault at', BALANCER_VAULT);
    return;
  }

  await deploy('BalancerVault', {
    contract: 'BalancerVaultMock',
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['BalancerVault'];
