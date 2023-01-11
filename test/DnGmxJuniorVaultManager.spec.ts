import { parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { loadFixture } from 'ethereum-waffle';
import { BigNumber, BigNumberish } from 'ethers';
import hre, { ethers } from 'hardhat';
import {
  DnGmxJuniorVaultManager,
  DnGmxJuniorVaultManagerTest,
  IERC20,
  ISwapRouter,
  QuoterV3,
} from '../typechain-types';
import addresses from './fixtures/addresses';
import { generateErc20Balance } from './utils/generator';
import { formatUnits } from 'ethers/lib/utils';

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

  async function deployMock() {
    const dnGmxJuniorVaultManager = (await (
      await hre.ethers.getContractFactory('contracts/libraries/DnGmxJuniorVaultManager.sol:DnGmxJuniorVaultManager')
    ).deploy()) as DnGmxJuniorVaultManager;

    const quoterMock = await (
      await hre.ethers.getContractFactory('QuoterV3Mock', {
        libraries: {
          ['contracts/libraries/DnGmxJuniorVaultManager.sol:DnGmxJuniorVaultManager']: dnGmxJuniorVaultManager.address,
        },
      })
    ).deploy();

    await quoterMock.setSlippages(90, 15);
    return quoterMock;
  }

  async function deployTest() {
    const quoter = (await hre.ethers.deployContract('QuoterV3', [
      '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      weth.address,
    ])) as QuoterV3;

    const test = (await hre.ethers.deployContract('DnGmxJuniorVaultManagerTest', [
      usdc.address,
      weth.address,
      wbtc.address,
      quoter.address,
    ])) as DnGmxJuniorVaultManagerTest;

    return { test, quoter };
  }

  describe('#getQuote', () => {
    describe('positive input or exactIn', () => {
      it('wbtc to usdc', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const btcAmount = parseBtc('1');
        const usdcAmount = await test.getQuote(btcAmount, test.WBTC_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.true;
        expect(parseUsdc('15000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('25000'))).to.be.true;

        const usdcAmountAbs = await quoter.quoteExactInput(test.WBTC_TO_USDC(), btcAmount);
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to wbtc', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('20000');
        const btcAmount = await test.getQuote(usdcAmount, test.USDC_TO_WBTC());

        expect(btcAmount.isNegative()).to.be.true;
        expect(parseBtc('0.5').lt(btcAmount.abs()) && btcAmount.abs().lt(parseBtc('2'))).to.be.true;

        const btcAmountAbs = await quoter.quoteExactInput(test.USDC_TO_WBTC(), usdcAmount);
        expect(btcAmountAbs).to.be.eq(btcAmount.abs());
      });

      it('weth to usdc', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const ethAmount = parseEther('1');
        const usdcAmount = await test.getQuote(ethAmount, test.WETH_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.true;
        expect(parseUsdc('1000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('2000'))).to.be.true;

        const usdcAmountAbs = await quoter.quoteExactInput(test.WETH_TO_USDC(), ethAmount);
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to weth', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('2000');

        const ethAmount = await test.getQuote(usdcAmount, test.USDC_TO_WETH());

        expect(ethAmount.isNegative()).to.be.true;
        expect(parseEther('0.5').lt(ethAmount.abs()) && ethAmount.abs().lt(parseEther('2'))).to.be.true;

        const ethAmountAbs = await quoter.quoteExactInput(test.USDC_TO_WETH(), usdcAmount);
        expect(ethAmountAbs).to.be.eq(ethAmount.abs());
      });
    });

    describe('negative input or exactOut', () => {
      it('wbtc to usdc', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const btcAmount = parseBtc('-1');
        const usdcAmount = await test.getQuote(btcAmount, test.WBTC_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.false;
        expect(parseUsdc('15000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('25000'))).to.be.true;

        const usdcAmountAbs = await quoter.quoteExactOutput(test.WBTC_TO_USDC(), btcAmount.abs());
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());

        // console.log({ usdcAmount: formatUnits(usdcAmount, 6), btcAmount: formatUnits(btcAmount, 8) });
      });

      it('usdc to wbtc', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('-20000');
        const btcAmount = await test.getQuote(usdcAmount, test.USDC_TO_WBTC());

        expect(btcAmount.isNegative()).to.be.false;
        expect(parseBtc('0.5').lt(btcAmount.abs()) && btcAmount.abs().lt(parseBtc('2'))).to.be.true;

        const btcAmountAbs = await quoter.quoteExactOutput(test.USDC_TO_WBTC(), usdcAmount.abs());
        expect(btcAmountAbs).to.be.eq(btcAmount.abs());
      });

      it('weth to usdc', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const ethAmount = parseEther('-1');
        const usdcAmount = await test.getQuote(ethAmount, test.WETH_TO_USDC());

        expect(usdcAmount.isNegative()).to.be.false;
        expect(parseUsdc('1000').lt(usdcAmount.abs()) && usdcAmount.abs().lt(parseUsdc('2000'))).to.be.true;

        const usdcAmountAbs = await quoter.quoteExactOutput(test.WETH_TO_USDC(), ethAmount.abs());
        expect(usdcAmountAbs).to.be.eq(usdcAmount.abs());
      });

      it('usdc to weth', async () => {
        const { quoter, test } = await loadFixture(deployTest);

        const usdcAmount = parseUsdc('-2000');

        const ethAmount = await test.getQuote(usdcAmount, test.USDC_TO_WETH());

        expect(ethAmount.isNegative()).to.be.false;
        expect(parseEther('0.5').lt(ethAmount.abs()) && ethAmount.abs().lt(parseEther('2'))).to.be.true;

        const ethAmountAbs = await quoter.quoteExactOutput(test.USDC_TO_WETH(), usdcAmount.abs());
        expect(ethAmountAbs).to.be.eq(ethAmount.abs());
      });
    });
  });

  describe('#quoteSwapSlippageLoss', () => {
    it('should quote btc swap loss correctly', async () => {
      const { test } = await loadFixture(deployTest);

      const btcAmount = parseBtc('1');
      const btcLossQuoted = await test.quoteSwapSlippageLoss(btcAmount, 0);
      const btcLossActual = await executeSwapAndCalculateSlippageLoss(wbtc, usdc, btcAmount, test.WBTC_TO_USDC(), test);

      expect(btcLossQuoted).to.be.eq(btcLossActual);
    });

    it('should quote eth swap loss correctly', async () => {
      const { test } = await loadFixture(deployTest);

      const ethAmount = parseEther('15');
      const ethLossQuoted = await test.quoteSwapSlippageLoss(0, ethAmount);
      const ethLossActual = await executeSwapAndCalculateSlippageLoss(weth, usdc, ethAmount, test.WETH_TO_USDC(), test);

      expect(ethLossQuoted).to.be.eq(ethLossActual);
    });

    it('should quote btc and eth swap loss together correctly', async () => {
      const { test } = await loadFixture(deployTest);

      const btcAmount = parseBtc('1');
      const ethAmount = parseEther('15');
      const totalLossQuoted = await test.quoteSwapSlippageLoss(btcAmount, ethAmount);

      const btcLossActual = await executeSwapAndCalculateSlippageLoss(wbtc, usdc, btcAmount, test.WBTC_TO_USDC(), test);
      const ethLossActual = await executeSwapAndCalculateSlippageLoss(weth, usdc, ethAmount, test.WETH_TO_USDC(), test);

      expect(totalLossQuoted).to.be.eq(btcLossActual.add(ethLossActual));
    });

    it('btc +ve, eth +ve');
    it('btc +ve, eth -ve');
    it('btc -ve, eth +ve');
    it('btc -ve, eth -ve');
    it('btc -ve and huge, eth +ve');
    it('btc +ve, eth -ve and huge');

    async function executeSwapAndCalculateSlippageLoss(
      token: IERC20,
      otherToken: IERC20,
      tokenAmount: BigNumberish,
      path: string | Promise<string>,
      test: DnGmxJuniorVaultManagerTest,
    ) {
      const tokenPrice = await test.getTokenPriceInUsdc(token.address);
      const otherTokenPrice = await test.getTokenPriceInUsdc(otherToken.address);
      const PRICE_PRECISION = BigNumber.from(10).pow(30);

      tokenAmount = BigNumber.from(tokenAmount);
      if (tokenAmount.gt(0)) {
        await token.approve(swapRouter.address, tokenAmount.abs());
        const params: ISwapRouter.ExactInputParamsStruct = {
          path,
          recipient: signer.address,
          deadline: Math.floor(Date.now() / 1000) + 60,
          amountIn: tokenAmount,
          amountOutMinimum: 0,
        };
        const otherTokenAmount = await swapRouter.callStatic.exactInput(params);
        await swapRouter.exactInput(params);
        const dollarsPaid = tokenAmount.mul(tokenPrice).div(PRICE_PRECISION);
        const dollarsReceived = otherTokenAmount.mul(otherTokenPrice).div(PRICE_PRECISION);
        return dollarsPaid.gt(dollarsReceived) ? dollarsPaid.sub(dollarsReceived) : BigNumber.from(0);
      } else if (tokenAmount.lt(0)) {
        await otherToken.approve(swapRouter.address, ethers.constants.MaxUint256);
        const params: ISwapRouter.ExactOutputParamsStruct = {
          path,
          recipient: signer.address,
          deadline: Math.floor(Date.now() / 1000) + 60,
          amountOut: tokenAmount.abs(),
          amountInMaximum: 0,
        };
        const otherTokenAmount = await swapRouter.callStatic.exactOutput(params);
        await swapRouter.exactOutput(params);
        const dollarsPaid = otherTokenAmount.mul(otherTokenPrice).div(PRICE_PRECISION);
        const dollarsReceived = tokenAmount.mul(tokenPrice).div(PRICE_PRECISION);
        return dollarsPaid.gt(dollarsReceived) ? dollarsPaid.sub(dollarsReceived) : BigNumber.from(0);
      } else {
        return BigNumber.from(0);
      }
    }
  });

  describe('#mock', () => {
    it('should mock slippage on basis chainlink price', async () => {
      const mock = await loadFixture(deployMock);

      const btcAmount = parseBtc('1');
      const ethAmount = parseEther('1');

      console.log(formatUnits(await mock.quoteExactInput(mock.WBTC_TO_USDC(), btcAmount), 6));
      console.log(formatUnits(await mock.quoteExactInput(mock.WETH_TO_USDC(), ethAmount), 6));

      console.log(formatUnits(await mock.quoteExactOutput(mock.USDC_TO_WBTC(), btcAmount), 6));
      console.log(formatUnits(await mock.quoteExactOutput(mock.USDC_TO_WETH(), ethAmount), 6));
    });
  });
});

function parseBtc(amount: string) {
  return parseUnits(amount, 8);
}

function parseUsdc(amount: string) {
  return parseUnits(amount, 6);
}
