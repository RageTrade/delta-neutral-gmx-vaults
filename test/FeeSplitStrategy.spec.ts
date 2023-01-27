import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { FeeSplitStrategyMock } from '../typechain-types/contracts/mocks/FeeSplitStrategyMock';

describe('Fee Split Strategy', () => {
  let feeSplitStrategy: FeeSplitStrategyMock;

  before(async () => {
    feeSplitStrategy = await (await ethers.getContractFactory('FeeSplitStrategyMock')).deploy();
  });

  describe('Setter', () => {
    it('Set Variables', async () => {
      const infoToSet = {
        optimalUtilizationRate: 8n * 10n ** 29n,
        baseVariableBorrowRate: 10n ** 29n,
        variableRateSlope1: 10n ** 29n,
        variableRateSlope2: 5n * 10n ** 29n,
      };
      await feeSplitStrategy.setFeeSplitStrategy(infoToSet);

      const info = await feeSplitStrategy.info();

      expect(info.optimalUtilizationRate).to.eq(infoToSet.optimalUtilizationRate);
      expect(info.baseVariableBorrowRate).to.eq(infoToSet.baseVariableBorrowRate);
      expect(info.variableRateSlope1).to.eq(infoToSet.variableRateSlope1);
      expect(info.variableRateSlope2).to.eq(infoToSet.variableRateSlope2);
    });
  });

  describe('Fee Split Rate', () => {
    it('Check 1', async () => {
      const info = {
        optimalUtilizationRate: BigNumber.from(8n * 10n ** 29n),
        baseVariableBorrowRate: BigNumber.from(10n ** 29n),
        variableRateSlope1: BigNumber.from(10n ** 29n),
        variableRateSlope2: BigNumber.from(5n * 10n ** 29n),
      };
      await feeSplitStrategy.setFeeSplitStrategy(info);

      expect(await feeSplitStrategy.calculateFeeSplit(100n, 0n)).to.eq(info.baseVariableBorrowRate);
      expect(await feeSplitStrategy.calculateFeeSplit(30n, 70n)).to.eq(
        info.baseVariableBorrowRate.add(
          info.variableRateSlope1
            .mul(70n)
            .div(100n)
            .mul(10n ** 30n)
            .div(info.optimalUtilizationRate),
        ),
      );
      expect(await feeSplitStrategy.calculateFeeSplit(20n, 80n)).to.eq(
        info.baseVariableBorrowRate.add(info.variableRateSlope1),
      );
      expect(await feeSplitStrategy.calculateFeeSplit(10n, 90n)).to.eq(
        info.baseVariableBorrowRate.add(info.variableRateSlope1).add(info.variableRateSlope2.mul(10n).div(20n)),
      );
      expect(await feeSplitStrategy.calculateFeeSplit(0n, 100n)).to.eq(
        info.baseVariableBorrowRate.add(info.variableRateSlope1).add(info.variableRateSlope2),
      );
    });
  });
});
