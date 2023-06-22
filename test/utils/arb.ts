import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { IUniswapV3Pool__factory, priceToSqrtPriceX96, sqrtPriceX96ToPrice, uniswap, typechain } from '@ragetrade/sdk';
import { BigNumber, ethers } from 'ethers';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { IERC20Metadata__factory, IPoolAddressesProvider__factory, ISwapRouter } from '../../typechain-types';
import addresses from '../fixtures/addresses';
import { generateErc20Balance } from './generator';

export async function arb(
  signer: SignerWithAddress,
  token0_address: string,
  token1_address: string,
  feeTier: number,
  flipPrice: boolean,
) {
  if (BigNumber.from(token0_address).gt(BigNumber.from(token1_address))) {
    [token0_address, token1_address] = [token1_address, token0_address];
  }

  const token0 = IERC20Metadata__factory.connect(token0_address, signer);
  const token1 = IERC20Metadata__factory.connect(token1_address, signer);

  const token0_name = await token0.symbol();
  const token1_name = await token1.symbol();
  const token0_decimals = await token0.decimals();
  const token1_decimals = await token1.decimals();

  await generateErc20Balance(token0, parseUnits('10000000000000', token0_decimals));
  await generateErc20Balance(token1, parseUnits('10000000000000', token1_decimals));

  // console.log(`\nArbing ${token0_name}-${token1_name}-${feeTier} pool`);

  // chainlink prices
  const poolAddressProvider = IPoolAddressesProvider__factory.connect(addresses.AAVE_POOL_ADDRESS_PROVIDER, signer);
  const priceOracleAddress = await poolAddressProvider.getPriceOracle();
  const priceOracle = typechain.deltaNeutralGmxVaults.IPriceOracle__factory.connect(priceOracleAddress, signer);
  const token0_price = await priceOracle.getAssetPrice(token0.address);
  const token1_price = await priceOracle.getAssetPrice(token1.address);
  const token0_priceNumber = Number(formatUnits(token0_price, 8));
  const token1_priceNumber = Number(formatUnits(token1_price, 8));
  // console.log('chainlink prices', { [token0_name]: token0_priceNumber, [token1_name]: token1_priceNumber });

  const { uniswapV3Factory, uniswapV3RouterAddress } = uniswap.getContractsSync('arbmain', signer);
  const poolAddress = await uniswapV3Factory.getPool(token0.address, token1.address, feeTier);
  const pool = IUniswapV3Pool__factory.connect(poolAddress, signer);

  const { sqrtPriceX96, tick } = await pool.slot0();
  // console.log('liquidity', await pool.liquidity());
  // console.log('tick', tick);

  // uniswap price
  const priceUniswap = await sqrtPriceX96ToPrice(sqrtPriceX96, token1_decimals, token0_decimals);
  if (flipPrice) {
    // console.log(`uniswap price ${token1_name}/${token0_name}`, priceUniswap, sqrtPriceX96.toString());
  } else {
    // console.log(`uniswap price ${token0_name}/${token1_name}`, 1 / priceUniswap, sqrtPriceX96.toString());
  }

  // target price
  const sqrtPriceLimit = await priceToSqrtPriceX96(
    token0_priceNumber / token1_priceNumber, // chainlink
    token1_decimals,
    token0_decimals,
  );

  if ((await token1.allowance(signer.address, uniswapV3RouterAddress.address)).isZero()) {
    await token1.approve(uniswapV3RouterAddress.address, ethers.constants.MaxUint256);
  }

  if ((await token0.allowance(signer.address, uniswapV3RouterAddress.address)).isZero()) {
    await token0.approve(uniswapV3RouterAddress.address, ethers.constants.MaxUint256);
  }

  if (sqrtPriceLimit.eq(sqrtPriceX96)) {
    // console.log('price is already correct');
    return;
  }

  const buyToken0 = sqrtPriceLimit.gt(sqrtPriceX96);

  const amountIn = buyToken0 ? await token1.balanceOf(signer.address) : await token0.balanceOf(signer.address);

  // console.log('exactIn', formatUnits(amountIn, 6), buyToken0 ? token1_name : token0_name);

  // console.log(token1.address, token0.address);
  // console.log('sqrtPriceLimit', sqrtPriceLimit.toString());

  const params: ISwapRouter.ExactInputSingleParamsStruct = {
    tokenIn: buyToken0 ? token1.address : token0.address,
    tokenOut: buyToken0 ? token0.address : token1.address,
    fee: feeTier,
    recipient: signer.address,
    deadline: Math.floor(Date.now() / 1000) + 100000,
    amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: sqrtPriceLimit,
  };
  const result = await uniswapV3RouterAddress.callStatic.exactInputSingle(params);
  // console.log(
  //   'amountOut',
  //   formatUnits(result, buyToken0 ? token0_decimals : token1_decimals),
  //   buyToken0 ? token0_name : token1_name,
  // );

  await uniswapV3RouterAddress.exactInputSingle(params);
  // console.log('arbing done');
}
