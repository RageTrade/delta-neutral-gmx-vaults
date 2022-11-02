import { tokens } from '@ragetrade/sdk';
import { BigNumberish } from 'ethers';
import hre, { ethers } from 'hardhat';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { FeeSplitStrategy } from '../typechain-types/contracts/vaults/DnGmxSeniorVault';

const CHAIN_ID = {
  arbmain: 42161,
  arbtest: 421611,
  arbgoerli: 421613,
  hardhat: 31337,
};

export const skip = () => true;

export interface NetworkInfo {
  PROXY_ADMIN_ADDRESS?: string;

  WETH_ADDRESS: string;
  WBTC_ADDRESS: string;
  USDC_ADDRESS: string;

  GMX_REWARD_ROUTER: string;
  GMX_SGLP_ADDRESS: string;
  GLP_MANAGER: string;

  BALANCER_VAULT?: string;
  UNI_V3_SWAP_ROUTER: string;

  AAVE_REWARDS_CONTROLLER: string;
  AAVE_POOL_ADDRESS_PROVIDER: string;

  // senior vault
  BORROW_CAP: BigNumberish;
  MAX_UTILIZATION_BPS: BigNumberish;
  DEPOSIT_CAP_SR_VAULT: BigNumberish;

  // fee split strategy
  FEE_STRATEGY_PARAMS: FeeSplitStrategy.InfoStruct;

  // junior vault
  FEE_BPS: BigNumberish;
  FEE_RECIPIENT: string;
  WITHDRAW_FEE_BPS: BigNumberish;

  TARGET_HEALTH_FACTOR: BigNumberish;

  THRESHOLDS: {
    slippageThresholdSwapBtcBps: BigNumberish,
    slippageThresholdSwapEthBps: BigNumberish,
    slippageThresholdGmxBps: BigNumberish,
    usdcConversionThreshold: BigNumberish,
    wethConversionThreshold: BigNumberish,
    hedgeUsdcAmountThreshold: BigNumberish,
    partialBtcHedgeUsdcAmountThreshold: BigNumberish,
    partialEthHedgeUsdcAmountThreshold: BigNumberish,
  }

  REBALANCE_PARAMS: {
    rebalanceTimeThreshold: BigNumberish,
    rebalanceDeltaThresholdBps: BigNumberish,
    rebalanceHfThresholdBps: BigNumberish,
  }

  KEEPER_JR_VAULT: string;
  DEPOSIT_CAP_JR_VAULT: BigNumberish;

  // batching manager
  KEEPER_BATCHING_MANAGER: string;
  SLIPPAGE_THRESHOLD_BATCHING_MANAGER: BigNumberish;

  // withdraw periphery
  SLIPPAGE_THRESHOLD_WITHDRAW_PERIPHERY: BigNumberish;
}

export async function getNetworkInfo(this: any): Promise<NetworkInfo> {
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const tokensAddresses = await tokens.getAddresses(
    // if hardhat then use addresses of arbmain, bcz hardhat is mainnet fork of arbmain
    chainId === CHAIN_ID.hardhat ? CHAIN_ID.arbmain : chainId,
  );

  const arbmainNetworkInfo: NetworkInfo = {

    PROXY_ADMIN_ADDRESS: '', // TODO

    WETH_ADDRESS: tokensAddresses.wethAddress,
    WBTC_ADDRESS: tokensAddresses.wbtcAddress,
    USDC_ADDRESS: tokensAddresses.usdcAddress,

    GMX_REWARD_ROUTER: '0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1',
    GMX_SGLP_ADDRESS: '0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE',
    GLP_MANAGER: '0x321F653eED006AD1C29D174e17d96351BDe22649',

    BALANCER_VAULT: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    UNI_V3_SWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',

    AAVE_POOL_ADDRESS_PROVIDER: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    AAVE_REWARDS_CONTROLLER: ethers.constants.AddressZero, // TODO

    // senior vault
    BORROW_CAP: 0, // TODO
    MAX_UTILIZATION_BPS: 0, // TODO
    DEPOSIT_CAP_SR_VAULT: '', // TODO

    // fee split strategy
    FEE_STRATEGY_PARAMS: {
      optimalUtilizationRate: 0,
      baseVariableBorrowRate: 0,
      variableRateSlope1: 0,
      variableRateSlope2: 0,
    },

    // junior vault
    FEE_BPS: 0, // TODO
    FEE_RECIPIENT: '', // TODO
    WITHDRAW_FEE_BPS: 0, // TODO

    TARGET_HEALTH_FACTOR: 0, // TODO

    THRESHOLDS: {
      slippageThresholdSwapBtcBps: '', // TODO
      slippageThresholdSwapEthBps: '', // TODO
      slippageThresholdGmxBps: '', // TODO
      usdcConversionThreshold: '', // TODO
      wethConversionThreshold: '', // TODO
      hedgeUsdcAmountThreshold: '', // TODO
      partialBtcHedgeUsdcAmountThreshold: '', // TODO
      partialEthHedgeUsdcAmountThreshold: '', // TODO
    },
  
    REBALANCE_PARAMS: {
      rebalanceTimeThreshold: '', // TODO
      rebalanceDeltaThresholdBps: '', // TODO
      rebalanceHfThresholdBps: '', // TODO
    },

    KEEPER_JR_VAULT: '', // TODO
    DEPOSIT_CAP_JR_VAULT: '', // TODO

    // batching manager
    KEEPER_BATCHING_MANAGER: '', // TODO
    SLIPPAGE_THRESHOLD_BATCHING_MANAGER: '', // TODO

    // withdraw periphery
    SLIPPAGE_THRESHOLD_WITHDRAW_PERIPHERY: '', // TODO
  };

  const arbgoerliNetworkInfo: NetworkInfo = {
    PROXY_ADMIN_ADDRESS: '0x0f48093988a12D8173F9F928dA800e6729f9cFc3',

    WETH_ADDRESS: '0xCDa739D69067333974cD73A722aB92E5e0ad8a4F',
    WBTC_ADDRESS: '0x2Df743730160059c50c6bA9E87b30876FA6Db720',
    USDC_ADDRESS: '0x6775842AE82BF2F0f987b10526768Ad89d79536E',

    GMX_REWARD_ROUTER: '0xB627689d94BE29451b3E4Fa734F9cA4Be83b7eE3',
    GMX_SGLP_ADDRESS: '0x28Fa343Dc9af1B976688C6551784FF9AC20D2937',
    GLP_MANAGER: '0x17e14B4C2C519DC119ffE9E01520650D938fcD94',

    BALANCER_VAULT: '0x4A6fc4ea078e5272Eda56Fd8b3D0C70F91240f25',
    UNI_V3_SWAP_ROUTER: '0xc05237c7c22bd0550fdab72858bc9fb517e3324e',

    AAVE_POOL_ADDRESS_PROVIDER: '0xF8aa90E66B8BAe13f2e4aDe6104abAb8eeDaBfdc',
    AAVE_REWARDS_CONTROLLER: ethers.constants.AddressZero,

    // senior vault
    BORROW_CAP: parseUnits('100000000', 6),
    MAX_UTILIZATION_BPS: 9_000,
    DEPOSIT_CAP_SR_VAULT: parseUnits('150000000', 6),

    // fee split strategy
    FEE_STRATEGY_PARAMS: {
      optimalUtilizationRate: 8n * 10n ** 29n,
      baseVariableBorrowRate: 10n ** 29n,
      variableRateSlope1: 10n ** 29n,
      variableRateSlope2: 5n * 10n ** 29n,
    },

    // junior vault
    FEE_BPS: 1000,
    FEE_RECIPIENT: '0x4ec0dda0430A54b4796109913545F715B2d89F34',
    WITHDRAW_FEE_BPS: 50,

    TARGET_HEALTH_FACTOR: 15_000,

    THRESHOLDS: {
      slippageThresholdSwapBtcBps: 100, // slippageThresholdSwapBtcBps,
      slippageThresholdSwapEthBps: 100, // slippageThresholdSwapEthBps,
      slippageThresholdGmxBps: 100, // slippageThresholdGmxBps,
      usdcConversionThreshold: parseUnits('1', 6), // usdcConversionThreshold,
      wethConversionThreshold: 10n ** 15n, // wethConversionThreshold,
      hedgeUsdcAmountThreshold: parseUnits('1', 6), // hedgeUsdcAmountThreshold,
      partialBtcHedgeUsdcAmountThreshold: parseUnits('1000000', 6), // partialBtcHedgeUsdcAmountThreshold,
      partialEthHedgeUsdcAmountThreshold: parseUnits('1000000', 6), // partialEthHedgeUsdcAmountThreshold,
    },

    REBALANCE_PARAMS: {
      rebalanceTimeThreshold: 86400,
      rebalanceDeltaThresholdBps: 500,
      rebalanceHfThresholdBps: 10_000,
    },

    KEEPER_JR_VAULT: '0x5F31c02A3f1a61eD60534C2d04fcD0645b17F069',
    DEPOSIT_CAP_JR_VAULT: parseEther('1000000000'),

    // batching manager
    KEEPER_BATCHING_MANAGER: '0x111375FAe3228bdE95F82581270a1E2Ef82Ef203',
    SLIPPAGE_THRESHOLD_BATCHING_MANAGER: 100,

    // withdraw periphery
    SLIPPAGE_THRESHOLD_WITHDRAW_PERIPHERY: 100,
  }

  switch (chainId) {
    case CHAIN_ID.arbmain: // Arbitrum Mainnet
      return arbmainNetworkInfo
    case CHAIN_ID.hardhat: // Hardhat Mainnet Fork
      return arbmainNetworkInfo;
    case CHAIN_ID.arbgoerli: // Arbitrum Goerli
      return arbgoerliNetworkInfo;
    default:
      throw new Error(`Chain ID ${chainId} is recognized, please add addresses to deploy/network-info.ts`);
  }
}

export const waitConfirmations = hre.network.config.chainId !== 31337 ? 2 : 0;
