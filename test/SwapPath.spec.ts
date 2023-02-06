import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { concat, hexlify, hexZeroPad } from 'ethers/lib/utils';
import hre from 'hardhat';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { SwapPathTest } from '../typechain-types';
import addresses from './fixtures/addresses';

describe('SwapPath', () => {
  async function deployTest() {
    const test = (await hre.ethers.deployContract('SwapPathTest')) as SwapPathTest;
    return { test };
  }

  describe('#generate1', () => {
    it('exactIn', async () => {
      const { test } = await loadFixture(deployTest);
      const args = [addresses.USDC, uint24(500), addresses.WETH] as const;
      const result = await test.generate1(...args, true);
      expect(result).to.equal(hexlify(concat(args)));
    });

    it('exactOut', async () => {
      const { test } = await loadFixture(deployTest);
      const args = [addresses.WETH, uint24(500), addresses.WBTC] as const;
      const result = await test.generate1(...args, false);
      expect(result).to.equal(hexlify(concat((args as any).reverse())));
    });
  });

  describe('#generate2', () => {
    it('exactIn', async () => {
      const { test } = await loadFixture(deployTest);
      const args = [addresses.USDC, uint24(999), addresses.WETH, uint24(500), addresses.WBTC] as const;
      const result = await test.generate2(...args, true);
      expect(result).to.equal(hexlify(concat(args)));
    });

    it('exactOut', async () => {
      const { test } = await loadFixture(deployTest);
      const args = [addresses.USDC, uint24(999), addresses.WETH, uint24(500), addresses.WBTC] as const;
      const result = await test.generate2(...args, false);
      expect(result).to.equal(hexlify(concat((args as any).reverse())));
    });
  });
});

function uint24(value: BigNumberish): string {
  return hexZeroPad(BigNumber.from(value).toHexString(), 3);
}
