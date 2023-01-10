import { LogDescription } from '@ethersproject/abi';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { expect } from 'chai';
import { deployContract, loadFixture } from 'ethereum-waffle';
import hre from 'hardhat';
import { DnGmxJuniorVaultManagerTest, IERC20, QuoterV3 } from '../typechain-types';
import addresses from './fixtures/addresses';

describe('DnGmxJuniorVaultManager', () => {
  let weth: IERC20;
  let wbtc: IERC20;
  let usdc: IERC20;

  before(async () => {
    weth = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WETH);
    wbtc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WBTC);
    usdc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDC);
  });

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

  describe('#quoteSwapSlippage', () => {
    it('btc +ve, eth +ve');
    it('btc +ve, eth -ve');
    it('btc -ve, eth +ve');
    it('btc -ve, eth -ve');
    it('btc -ve and huge, eth +ve');
    it('btc +ve, eth -ve and huge');
  });
});

function parseBtc(amount: string) {
  return parseUnits(amount, 8);
}

function parseUsdc(amount: string) {
  return parseUnits(amount, 6);
}
