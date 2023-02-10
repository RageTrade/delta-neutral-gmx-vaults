import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SafeCastTest } from '../typechain-types';

describe('SafeCast', () => {
  async function deployTest() {
    const test = (await hre.ethers.deployContract('SafeCastTest')) as SafeCastTest;
    return { test };
  }

  describe('#toUint128', () => {
    it('works', async () => {
      const { test } = await loadFixture(deployTest);
      const amount = await test.toUint128(100);
      expect(amount).to.equal(100);
    });

    it('fails when overflow');
  });

  describe('#toInt128', () => {
    it('works', async () => {
      const { test } = await loadFixture(deployTest);
      const amount = await test.toInt128(100);
      expect(amount).to.equal(100);
    });

    it('fails when overflow');
  });

  describe('#toInt256', () => {
    it('works', async () => {
      const { test } = await loadFixture(deployTest);
      const amount = await test.toInt256(100);
      expect(amount).to.equal(100);
    });

    it('fails when overflow');
  });
});
