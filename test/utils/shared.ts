import hre from 'hardhat';

export async function increaseBlockTimestamp(timestampDelta: number) {
  const block = await hre.ethers.provider.getBlock('latest');
  const curBlockTimestamp = block.timestamp;

  await hre.network.provider.send('evm_setNextBlockTimestamp', [curBlockTimestamp + timestampDelta]);
  await hre.network.provider.send('evm_mine');
}
