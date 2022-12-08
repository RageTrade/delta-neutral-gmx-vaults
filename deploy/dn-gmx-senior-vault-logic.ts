import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  await deploy('DnGmxSeniorVaultLogic', {
    contract: 'DnGmxSeniorVault',
    from: deployer,
    log: true,
    waitConfirmations,
  });
};

export default func;

func.tags = ['DnGmxSeniorVaultLogic'];
