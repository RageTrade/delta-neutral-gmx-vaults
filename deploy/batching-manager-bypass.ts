import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  await deploy('BatchingManagerBypass', {
    contract: 'BatchingManagerBypass',
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['BatchingManagerBypass'];
