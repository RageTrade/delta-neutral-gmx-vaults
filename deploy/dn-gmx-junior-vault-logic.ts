import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const DnGmxJuniorVaultManagerLibraryDeployment = await get('DnGmxJuniorVaultManagerLibrary');

  await deploy('DnGmxJuniorVaultLogic', {
    contract: 'DnGmxJuniorVault',
    from: deployer,
    log: true,
    waitConfirmations,
    libraries: {
      DnGmxJuniorVaultManager: DnGmxJuniorVaultManagerLibraryDeployment.address,
    },
  });
};

export default func;

func.tags = ['DnGmxJuniorVaultLogic'];
func.dependencies = ['DnGmxJuniorVaultManagerLibrary'];
