import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxBatchingManager__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  await deploy('DnGmxBatchingManagerLogic', {
    contract: 'DnGmxBatchingManager',
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['DnGmxBatchingManagerLogic'];
