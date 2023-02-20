import { parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, BigNumberish } from 'ethers';
import hre, { ethers } from 'hardhat';
import { DnGmxJuniorVaultManagerTest, IERC20, ISwapRouter, Quoter, QuoterLibTest } from '../typechain-types';
import addresses from './fixtures/addresses';
import { generateErc20Balance } from './utils/generator';

describe('QuoterLib', () => {
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
    const uniswapQuoter = (await hre.ethers.deployContract('Quoter', [
      '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      weth.address,
    ])) as Quoter;

    const test = (await hre.ethers.deployContract('QuoterLibTest', [
      usdc.address,
      weth.address,
      wbtc.address,
    ])) as QuoterLibTest;

    return { test, uniswapQuoter };
  }

  describe('#getQuote', () => {
    describe('positive input or exactIn', () => {
      it('wbtc to usdc', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const btcAmount = parseBtc('1');
        const usdcAmount = await test.getQuote(btcAmount, test.WBTC_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.true;
        expect(parseUsdc('15000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('25000'))).to.be.true;

        const usdcAmountAbs = await uniswapQuoter.callStatic.quoteExactInput(test.WBTC_TO_USDC(), btcAmount);
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to wbtc', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('20000');
        const btcAmount = await test.getQuote(usdcAmount, test.USDC_TO_WBTC());

        expect(btcAmount.isNegative()).to.be.true;
        expect(parseBtc('0.5').lt(btcAmount.abs()) && btcAmount.abs().lt(parseBtc('2'))).to.be.true;

        const btcAmountAbs = await uniswapQuoter.callStatic.quoteExactInput(test.USDC_TO_WBTC(), usdcAmount);
        expect(btcAmountAbs).to.be.eq(btcAmount.abs());
      });

      it('weth to usdc', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const ethAmount = parseEther('1');
        const usdcAmount = await test.getQuote(ethAmount, test.WETH_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.true;
        expect(parseUsdc('1000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('2000'))).to.be.true;

        const usdcAmountAbs = await uniswapQuoter.callStatic.quoteExactInput(test.WETH_TO_USDC(), ethAmount);
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to weth', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('2000');

        const ethAmount = await test.getQuote(usdcAmount, test.USDC_TO_WETH());

        expect(ethAmount.isNegative()).to.be.true;
        expect(parseEther('0.5').lt(ethAmount.abs()) && ethAmount.abs().lt(parseEther('2'))).to.be.true;

        const ethAmountAbs = await uniswapQuoter.callStatic.quoteExactInput(test.USDC_TO_WETH(), usdcAmount);
        expect(ethAmountAbs).to.be.eq(ethAmount.abs());
      });
    });

    describe('negative input or exactOut', () => {
      it('wbtc to usdc', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const btcAmount = parseBtc('-1');
        const usdcAmount = await test.getQuote(btcAmount, test.WBTC_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.false;
        expect(parseUsdc('15000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('25000'))).to.be.true;

        const usdcAmountAbs = await uniswapQuoter.callStatic.quoteExactOutput(test.WBTC_TO_USDC(), btcAmount.abs());
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to wbtc', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('-20000');
        const btcAmount = await test.getQuote(usdcAmount, test.USDC_TO_WBTC());

        expect(btcAmount.isNegative()).to.be.false;
        expect(parseBtc('0.5').lt(btcAmount.abs()) && btcAmount.abs().lt(parseBtc('2'))).to.be.true;

        const btcAmountAbs = await uniswapQuoter.callStatic.quoteExactOutput(test.USDC_TO_WBTC(), usdcAmount.abs());
        expect(btcAmountAbs).to.be.eq(btcAmount.abs());
      });

      it('weth to usdc', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const ethAmount = parseEther('-1');
        const usdcAmount = await test.getQuote(ethAmount, test.WETH_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.false;
        expect(parseUsdc('1000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('2000'))).to.be.true;

        const usdcAmountAbs = await uniswapQuoter.callStatic.quoteExactOutput(test.WETH_TO_USDC(), ethAmount.abs());
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to weth', async () => {
        const { uniswapQuoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('-2000');

        const ethAmount = await test.getQuote(usdcAmount, test.USDC_TO_WETH());

        expect(ethAmount.isNegative()).to.be.false;
        expect(parseEther('0.5').lt(ethAmount.abs()) && ethAmount.abs().lt(parseEther('2'))).to.be.true;

        const ethAmountAbs = await uniswapQuoter.callStatic.quoteExactOutput(test.USDC_TO_WETH(), usdcAmount.abs());
        expect(ethAmountAbs).to.be.eq(ethAmount.abs());
      });
    });
  });

  describe('#quoteCombinedSwap', () => {
    describe('btc +ve, eth +ve', () => {
      it('similar amounts', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('2'),
          ethAmount: parseEther('15'),
        });
      });
    });

    describe('btc +ve, eth -ve', () => {
      it('similar amounts', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('-15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('1'),
          ethAmount: parseEther('-30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('2'),
          ethAmount: parseEther('-15'),
        });
      });
    });

    describe('btc -ve, eth +ve', () => {
      it('similar amounts', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('-2'),
          ethAmount: parseEther('15'),
        });
      });
    });

    describe('btc -ve, eth -ve', () => {
      it('similar amounts', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('-15'),
        });
      });

      it('little btc, lot of eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('-1'),
          ethAmount: parseEther('-30'),
        });
      });

      it('lot of btc, little eth', async () => {
        await testQuoteCombinedSwap({
          btcAmount: parseBtc('-2'),
          ethAmount: parseEther('-15'),
        });
      });
    });
  });

  async function testQuoteCombinedSwap({ btcAmount, ethAmount }: { btcAmount: BigNumber; ethAmount: BigNumber }) {
    const { test } = await loadFixture(deployTest);

    const { usdcAmountInBtcSwap: usdcAmountInBtcSwapQuoted, usdcAmountInEthSwap: usdcAmountInEthSwapQuoted } =
      await test.quoteCombinedSwap(btcAmount, ethAmount);

    const { usdcAmount: usdcAmountInBtcSwapActual } = await executeSwapAndCalculateSlippageLoss(
      wbtc,
      btcAmount,
      test.WBTC_TO_USDC(),
      test,
    );
    const { usdcAmount: usdcAmountInEthSwapActual } = await executeSwapAndCalculateSlippageLoss(
      weth,
      ethAmount,
      test.WETH_TO_USDC(),
      test,
    );

    expectEqualWithAbsoluteError(usdcAmountInBtcSwapQuoted, usdcAmountInBtcSwapActual, 1);
    expectEqualWithAbsoluteError(usdcAmountInEthSwapQuoted, usdcAmountInEthSwapActual, 1);
  }

  async function executeSwapAndCalculateSlippageLoss(
    token: IERC20,
    tokenAmount: BigNumberish,
    path: string | Promise<string>,
    test: DnGmxJuniorVaultManagerTest | QuoterLibTest,
  ) {
    const tokenPrice = await test.getTokenPriceInUsdc(token.address);
    const usdcPrice = await test.getTokenPriceInUsdc(usdc.address);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    tokenAmount = BigNumber.from(tokenAmount);
    if (tokenAmount.gt(0)) {
      const params: ISwapRouter.ExactInputParamsStruct = {
        path,
        recipient: signer.address,
        deadline: BigNumber.from(2).pow(40),
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
        deadline: BigNumber.from(2).pow(40),
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
