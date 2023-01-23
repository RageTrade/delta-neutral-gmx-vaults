import { parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, BigNumberish } from 'ethers';
import hre, { ethers } from 'hardhat';
import { DnGmxJuniorVaultManagerTest, IERC20, ISwapRouter, Quoter, QuoterLib } from '../typechain-types';
import addresses from './fixtures/addresses';
import { generateErc20Balance } from './utils/generator';

describe('DnGmxJuniorVaultManager', () => {
  let weth: IERC20;
  let wbtc: IERC20;
  let usdc: IERC20;
  let swapRouter: ISwapRouter;
  let signer: SignerWithAddress;

  before(async () => {
    weth = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WETH);
    wbtc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WBTC);
    usdc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDC);
    swapRouter = await hre.ethers.getContractAt('SwapRouter', addresses.UNI_V3_SWAP_ROUTER);

    const signers = await hre.ethers.getSigners();
    signer = signers[0];

    await generateErc20Balance(weth, parseEther('100000'));
    await generateErc20Balance(wbtc, parseBtc('100000'));
    await generateErc20Balance(usdc, parseUsdc('100000000'));
  });

  async function deployTest() {
    const quoter = (await hre.ethers.deployContract('Quoter', [
      '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      weth.address,
    ])) as Quoter;

    const quoterLib = (await hre.ethers.deployContract('QuoterLib')) as QuoterLib;

    const test = (await hre.ethers.deployContract(
      'DnGmxJuniorVaultManagerTest',
      [usdc.address, weth.address, wbtc.address],
      { libraries: { QuoterLib: quoterLib.address } },
    )) as DnGmxJuniorVaultManagerTest;

    return { test };
  }

  describe('#quoteSwapSlippageLoss', () => {
    describe('basic', () => {
      it('should quote btc swap loss correctly', async () => {
        const { test } = await loadFixture(deployTest);

        const btcAmount = parseBtc('1');
        const btcLossQuoted = await test.quoteSwapSlippageLoss(btcAmount, 0);
        const { loss: btcLossActual } = await executeSwapAndCalculateSlippageLoss(
          wbtc,
          btcAmount,
          test.WBTC_TO_USDC(),
          test,
        );

        expect(btcLossQuoted).to.be.eq(btcLossActual);
      });

      it('should quote eth swap loss correctly', async () => {
        const { test } = await loadFixture(deployTest);

        const ethAmount = parseEther('15');
        const ethLossQuoted = await test.quoteSwapSlippageLoss(0, ethAmount);
        const { loss: ethLossActual } = await executeSwapAndCalculateSlippageLoss(
          weth,
          ethAmount,
          test.WETH_TO_USDC(),
          test,
        );

        expect(ethLossQuoted).to.be.eq(ethLossActual);
      });

      it('should quote btc and eth swap loss together correctly', async () => {
        const { test } = await loadFixture(deployTest);

        const btcAmount = parseBtc('1');
        const ethAmount = parseEther('15');
        const totalLossQuoted = await test.quoteSwapSlippageLoss(btcAmount, ethAmount);

        const { loss: btcLossActual } = await executeSwapAndCalculateSlippageLoss(
          wbtc,
          btcAmount,
          test.WBTC_TO_USDC(),
          test,
        );
        const { loss: ethLossActual } = await executeSwapAndCalculateSlippageLoss(
          weth,
          ethAmount,
          test.WETH_TO_USDC(),
          test,
        );

        // Absolute error of 1 would be there because the intermediate eth amount in btc to usdc swap
        // is being derived by a reverse quote and it has error of 1.
        expectEqualWithAbsoluteError(totalLossQuoted, btcLossActual.add(ethLossActual), 1);
      });
    });

    describe('btc +ve, eth +ve', () => {
      it('similar amounts', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('2'),
          ethAmount: parseEther('15'),
        });
      });
    });

    describe('btc +ve, eth -ve', () => {
      it('similar amounts', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('-15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('-30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('2'),
          ethAmount: parseEther('-15'),
        });
      });
    });

    describe('btc -ve, eth +ve', () => {
      it('similar amounts', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('-2'),
          ethAmount: parseEther('15'),
        });
      });
    });

    describe('btc -ve, eth -ve', () => {
      it('similar amounts', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('-15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('-30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteSwapSlippageLoss({
          btcAmount: parseBtc('-2'),
          ethAmount: parseEther('-15'),
        });
      });
    });
  });

  async function testQuoteSwapSlippageLoss({ btcAmount, ethAmount }: { btcAmount: BigNumber; ethAmount: BigNumber }) {
    const { test } = await loadFixture(deployTest);

    const totalLossQuoted = await test.quoteSwapSlippageLoss(btcAmount, ethAmount);

    const { loss: btcLossActual } = await executeSwapAndCalculateSlippageLoss(
      wbtc,
      btcAmount,
      test.WBTC_TO_USDC(),
      test,
    );
    const { loss: ethLossActual } = await executeSwapAndCalculateSlippageLoss(
      weth,
      ethAmount,
      test.WETH_TO_USDC(),
      test,
    );

    expectEqualWithAbsoluteError(totalLossQuoted, btcLossActual.add(ethLossActual), 1);
  }

  async function executeSwapAndCalculateSlippageLoss(
    token: IERC20,
    // usdc: IERC20,
    tokenAmount: BigNumberish,
    path: string | Promise<string>,
    test: DnGmxJuniorVaultManagerTest,
  ) {
    const tokenPrice = await test.getTokenPriceInUsdc(token.address);
    const usdcPrice = await test.getTokenPriceInUsdc(usdc.address);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    tokenAmount = BigNumber.from(tokenAmount);
    if (tokenAmount.gt(0)) {
      const params: ISwapRouter.ExactInputParamsStruct = {
        path,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 60,
        amountIn: tokenAmount,
        amountOutMinimum: 0,
      };
      await token.approve(swapRouter.address, tokenAmount);
      const usdcAmount = await swapRouter.callStatic.exactInput(params);
      const dollarsPaid = mulDivUp(tokenAmount, tokenPrice, PRICE_PRECISION);
      const dollarsReceived = mulDivDown(usdcAmount, usdcPrice, PRICE_PRECISION);
      const loss = dollarsPaid.gt(dollarsReceived) ? dollarsPaid.sub(dollarsReceived) : BigNumber.from(0);
      // change price on uniswap
      await swapRouter.exactInput(params);
      return { usdcAmount: usdcAmount.mul(-1), loss };
    } else if (tokenAmount.lt(0)) {
      const params: ISwapRouter.ExactOutputParamsStruct = {
        path,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 60,
        amountOut: tokenAmount.abs(),
        amountInMaximum: ethers.constants.MaxUint256,
      };
      await usdc.approve(swapRouter.address, ethers.constants.MaxUint256);
      const usdcAmount = await swapRouter.callStatic.exactOutput(params);
      const dollarsPaid = mulDivUp(usdcAmount, usdcPrice, PRICE_PRECISION);
      const dollarsReceived = mulDivDown(tokenAmount.abs(), tokenPrice, PRICE_PRECISION);
      const loss = dollarsPaid.gt(dollarsReceived) ? dollarsPaid.sub(dollarsReceived) : BigNumber.from(0);
      // change price on uniswap
      await swapRouter.exactOutput(params);
      return { usdcAmount, loss };
    } else {
      return { usdcAmount: BigNumber.from(0), loss: BigNumber.from(0) };
    }
  }
});

function parseBtc(amount: string) {
  return parseUnits(amount, 8);
}

function parseUsdc(amount: string) {
  return parseUnits(amount, 6);
}

function mulDivUp(a: BigNumber, b: BigNumber, c: BigNumber) {
  let result = a.mul(b).div(c);
  if (!a.mul(b).eq(result.mul(c))) {
    result = result.add(1);
  }
  return result;
}

function mulDivDown(a: BigNumber, b: BigNumber, c: BigNumber) {
  return a.mul(b).div(c);
}

function expectEqualWithAbsoluteError(a: BigNumber, b: BigNumber, error: BigNumberish) {
  error = BigNumber.from(error);
  try {
    expect(a.gte(b.sub(error)) && a.lte(b.add(error))).to.be.true;
  } catch (e) {
    expect(a).to.be.eq(b); // for printing error
  }
}
