import { tokens } from '@ragetrade/sdk';
import { parseEther } from 'ethers/lib/utils';
import hre from 'hardhat';

const CHAIN_ID = {
  arbmain: 42161,
  arbtest: 421611,
  arbgoerli: 421613,
  hardhat: 31337,
};

export const skip = () => true;

export interface NetworkInfo {
  KEEPER_ADDRESS: string;
  DEPOSIT_CAP_JUNIOR_VAULT: string;
  DEPOSIT_CAP_SENIOR_VAULT: string;
  FEE_BPS: number;
  FEE_RECIPIENT?: string;

  PROXY_ADMIN_ADDRESS?: string;

  WETH_ADDRESS: string;
  WBTC_ADDRESS: string;
  USDC_ADDRESS: string;
  USDT_ADDRESS: string;

  CURVE_TRICRYPTO_POOL_ADDRESS: string;

  GMX_REWARD_ROUTER: string;
  GMX_SGLP_ADDRESS: string;
  GLP_MANAGER: string;

  BALANCER_VAULT?: string;
  UNI_V3_SWAP_ROUTER: string;
  AAVE_POOL_ADDRESS_PROVIDER: string;
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const tokensAddresses = await tokens.getAddresses(
    // if hardhat then use addresses of arbmain, bcz hardhat is mainnet fork of arbmain
    chainId === CHAIN_ID.hardhat ? CHAIN_ID.arbmain : chainId,
  );

  const arbmainNetworkInfo: NetworkInfo = {
    KEEPER_ADDRESS: '0xe1829BaD81E9146E18f28E28691D930c052483bA',
    DEPOSIT_CAP_JUNIOR_VAULT: parseEther('10000000').toString(), // TODO
    DEPOSIT_CAP_SENIOR_VAULT: parseEther('10000000').toString(), // TODO
    FEE_BPS: 1000,
    FEE_RECIPIENT: '', // TODO

    WETH_ADDRESS: tokensAddresses.wethAddress,
    WBTC_ADDRESS: tokensAddresses.wbtcAddress,
    USDC_ADDRESS: tokensAddresses.usdcAddress,
    USDT_ADDRESS: tokensAddresses.usdtAddress,

    CURVE_TRICRYPTO_POOL_ADDRESS: '0x960ea3e3C7FB317332d990873d354E18d7645590',

    GMX_REWARD_ROUTER: '0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1',
    GMX_SGLP_ADDRESS: '0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE',
    GLP_MANAGER: '0x321F653eED006AD1C29D174e17d96351BDe22649',

    BALANCER_VAULT: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    UNI_V3_SWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    AAVE_POOL_ADDRESS_PROVIDER: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
  };

  const arbgoerliNetworkInfo: NetworkInfo = {
    KEEPER_ADDRESS: '0xe1829BaD81E9146E18f28E28691D930c052483bA',
    DEPOSIT_CAP_JUNIOR_VAULT: parseEther('10000000').toString(), // TODO
    DEPOSIT_CAP_SENIOR_VAULT: parseEther('10000000').toString(), // TODO
    FEE_BPS: 1000,

    PROXY_ADMIN_ADDRESS: '0x0f48093988a12D8173F9F928dA800e6729f9cFc3',

    WETH_ADDRESS: '0xCDa739D69067333974cD73A722aB92E5e0ad8a4F',
    USDT_ADDRESS: '0xbAc565f93f3192D35E9106E67B9d5c9348bD9389',
    WBTC_ADDRESS: '0x2Df743730160059c50c6bA9E87b30876FA6Db720',
    USDC_ADDRESS: '0x6775842AE82BF2F0f987b10526768Ad89d79536E',

    CURVE_TRICRYPTO_POOL_ADDRESS: '0xd6395e62E2Ccdc331e7bCf925CbeB2799cB5BFE0',

    GMX_REWARD_ROUTER: '0xB627689d94BE29451b3E4Fa734F9cA4Be83b7eE3',
    GMX_SGLP_ADDRESS: '0x28Fa343Dc9af1B976688C6551784FF9AC20D2937',
    GLP_MANAGER: '0x17e14B4C2C519DC119ffE9E01520650D938fcD94',

    BALANCER_VAULT: '0x4A6fc4ea078e5272Eda56Fd8b3D0C70F91240f25',
    UNI_V3_SWAP_ROUTER: '0xc05237c7c22bd0550fdab72858bc9fb517e3324e',
    AAVE_POOL_ADDRESS_PROVIDER: '0xF8aa90E66B8BAe13f2e4aDe6104abAb8eeDaBfdc',
  };

  switch (chainId) {
    case CHAIN_ID.arbmain: // Arbitrum Mainnet
    case CHAIN_ID.hardhat: // Hardhat Mainnet Fork
      return arbmainNetworkInfo;
    case CHAIN_ID.arbgoerli: // Arbitrum Goerli
      return arbgoerliNetworkInfo;
    default:
      throw new Error(`Chain ID ${chainId} is recognized, please add addresses to deploy/network-info.ts`);
  }
}

export const waitConfirmations = hre.network.config.chainId !== 31337 ? 2 : 0;
