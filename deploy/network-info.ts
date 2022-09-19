import { getTokenAddresses } from '@ragetrade/sdk';
import hre from 'hardhat';

const CHAIN_ID = {
  mainnet: 1,
  ropsten: 3,
  rinkeby: 4,
  goerli: 5,
  kovan: 42,
  arbmain: 42161,
  arbtest: 421611, // arb rinkeby
  hardhat: 31337,
};

export const skip = () => true;

export interface NetworkInfo {
  USDC_ADDRESS: string;
  WETH_ADDRESS: string;
  WBTC_ADDRESS: string;

  GMX_REWARD_ROUTER: string;
  GMX_SGLP_ADDRESS: string;

  BALANCER_VAULT: string;
  UNI_V3_SWAP_ROUTER: string;
  AAVE_POOL_ADDRESS_PROVIDER: string;
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const tokens = await getTokenAddresses(
    // if hardhat then use addresses of arbmain, bcz hardhat is mainnet fork of arbmain
    chainId === CHAIN_ID.hardhat ? CHAIN_ID.arbmain : chainId,
  );

  const arbmainNetworkInfo: NetworkInfo = {
    USDC_ADDRESS: tokens.usdc,
    WETH_ADDRESS: tokens.weth,
    WBTC_ADDRESS: tokens.wbtc,

    GMX_REWARD_ROUTER: '0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1',
    GMX_SGLP_ADDRESS: '0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE',

    BALANCER_VAULT: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    UNI_V3_SWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    AAVE_POOL_ADDRESS_PROVIDER: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
  };

  switch (chainId) {
    case CHAIN_ID.arbmain: // Arbitrum Mainnet
      return arbmainNetworkInfo;
    case CHAIN_ID.hardhat: // Hardhat Mainnet Fork
      return arbmainNetworkInfo;
    default:
      throw new Error(`Chain ID ${chainId} is recognized, please add addresses to deploy/network-info.ts`);
  }
}

export const waitConfirmations = hre.network.config.chainId !== 31337 ? 2 : 0;
