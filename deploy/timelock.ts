import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const { MULTISIG } = await getNetworkInfo();

  const addr = MULTISIG ?? deployer;

  await deploy('Timelock', {
    contract: 'TimelockControllerWithMinDelayOverride',
    from: deployer,
    log: true,
    waitConfirmations,
    args: [
      2 * 24 * 60 * 60, // 2 days
      [addr], // proposers
      [
        // executors
        addr,
        // multisig signers added as executors for convenience
        '0xb3a2A149abfa8F1AA05D63Db3F83afDfD73B3958',
        '0x6429602699fEC6D205e0b9531C7f33476BA11Fb0',
        '0x45e48668F090a3eD1C7961421c60Df4E66f693BD',
        '0xf16e2db1102e0067bab490ff1ef23da2b3d30964',
        '0x507c7777837b85ede1e67f5a4554ddd7e58b1f87',
        '0xc30603461Be4C49CF8076797C18F48292fFDe03A',
      ],
    ],
  });
};

export default func;

func.tags = ['Timelock'];
