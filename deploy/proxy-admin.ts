import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ProxyAdmin__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const { PROXY_ADMIN_ADDRESS } = await getNetworkInfo();

  if (PROXY_ADMIN_ADDRESS) {
    console.log('skipping deployment for proxy admin, using:', PROXY_ADMIN_ADDRESS);
    await save('ProxyAdmin', { abi: ProxyAdmin__factory.abi as any, address: PROXY_ADMIN_ADDRESS });
  } else {
    await deploy('ProxyAdmin', {
      contract: 'ProxyAdmin',
      from: deployer,
      log: true,
      waitConfirmations,
      skipIfAlreadyDeployed: true,
    });
  }
};

export default func;

func.tags = ['ProxyAdmin'];
