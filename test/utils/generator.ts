import { BigNumber, BigNumberish, ethers } from 'ethers';
import hre from 'hardhat';
import { IERC20 as ERC20 } from '../../typechain-types/@openzeppelin/contracts/token/ERC20';

export const generateErc20Balance = async (contract: ERC20, amount: BigNumberish, to?: string) => {
  to = to ?? (await contract.signer.getAddress());
  const slotKey = await getSlotInvolved(contract.populateTransaction.balanceOf(to));

  await hre.network.provider.send('hardhat_setStorageAt', [
    contract.address,
    ethers.utils.hexValue('0x' + slotKey),
    ethers.utils.hexZeroPad(BigNumber.from(amount).toHexString(), 32),
  ]);

  const balanceAfter = await contract.balanceOf(to);
  if (balanceAfter.toHexString() !== BigNumber.from(amount).toHexString()) {
    throw new Error('was unable to increase the balance');
  }
};

async function getSlotInvolved(ptx: ethers.PopulatedTransaction | Promise<ethers.PopulatedTransaction>) {
  const [signer] = await hre.ethers.getSigners();
  ptx = await ptx;
  delete (ptx as any).from;
  const tx = await signer.sendTransaction(await ptx);
  await tx.wait();

  const result = await hre.network.provider.send('debug_traceTransaction', [tx.hash]);
  const keys = (result.structLogs as any[])
    .filter((s: { op: string }) => s.op == 'SLOAD')
    .map((s: { stack: string[] }) => {
      const slotKey = (s.stack as string[]).pop();
      if (slotKey === undefined) {
        throw new Error('bad SLOAD');
      }
      return slotKey;
    });

  if (keys.length === 0) {
    throw new Error('SLOAD not found');
  }

  return keys[keys.length - 1];
}
