import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const QuoterLibraryDeployment = await get('QuoterLibrary');

  await deploy('DnGmxJuniorVaultManagerLibrary', {
    contract: 'DnGmxJuniorVaultManager',
    from: deployer,
    log: true,
    waitConfirmations,
    libraries: {
      QuoterLib: QuoterLibraryDeployment.address,
    },
  });
};

export default func;

func.tags = ['DnGmxJuniorVaultManagerLibrary'];
func.dependencies = ['QuoterLibrary'];
