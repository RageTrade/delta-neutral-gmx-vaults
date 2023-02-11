import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-tracer';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'solidity-coverage';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-dependency-compiler';
import 'hardhat-storage-layout-changes';

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { Fragment } from 'ethers/lib/utils';
import { readJsonSync, writeJsonSync } from 'fs-extra';
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { task } from 'hardhat/config';
import nodePath from 'path';

// this compile task override is needed to copy missing abi fragments to respective artifacts (note its not aval to typechain)
task(TASK_COMPILE, 'Compiles the entire project, building all artifacts').setAction(async (taskArgs, _, runSuper) => {
  const compileSolOutput = await runSuper(taskArgs);

  copyEventErrorAbis(
    ['artifacts/contracts/libraries/DnGmxJuniorVaultManager.sol/DnGmxJuniorVaultManager.json'],
    'artifacts/contracts/vaults/DnGmxJuniorVault.sol/DnGmxJuniorVault.json',
  );

  function copyEventErrorAbis(froms: string[], to: string) {
    for (const from of froms) {
      copyEventErrorAbi(from, to);
    }
  }

  function copyEventErrorAbi(from: string, to: string) {
    const fromArtifact = readJsonSync(nodePath.resolve(__dirname, from));
    const toArtifact = readJsonSync(nodePath.resolve(__dirname, to));
    fromArtifact.abi.forEach((fromFragment: Fragment) => {
      if (
        // only copy error and event fragments
        (fromFragment.type === 'error' || fromFragment.type === 'event') &&
        // if fragment is already in the toArtifact, don't copy it
        !toArtifact.abi.find(
          ({ name, type }: Fragment) => name + '-' + type === fromFragment.name + '-' + fromFragment.type,
        )
      ) {
        toArtifact.abi.push(fromFragment);
      }
    });

    writeJsonSync(nodePath.resolve(__dirname, to), toArtifact, { spaces: 2 });
  }

  return compileSolOutput;
});

config();
const { ALCHEMY_KEY, LEDGER_ADDRESS } = process.env;

if (!process.env.ALCHEMY_KEY) {
  console.warn('PLEASE NOTE: The env var ALCHEMY_KEY is not set');
}

const pk = process.env.PRIVATE_KEY || ethers.utils.hexlify(ethers.utils.randomBytes(32));

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  networks: {
    hardhat: {
      forking: {
        url: `https://arb-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
        blockNumber: 56878000,
      },
      blockGasLimit: 0x1fffffffffff,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true,
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_KEY}`,
      accounts: [pk],
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
      accounts: [pk],
    },
    arbmain: {
      url: `https://arb1.arbitrum.io/rpc`,
      accounts: [pk],
      chainId: 42161,
    },
    mainnetfork: {
      url: `https://internal-rpc.rage.trade`,
      accounts: [pk],
      chainId: 31337,
    },
    arbtest: {
      url: `https://rinkeby.arbitrum.io/rpc`,
      accounts: [pk],
      chainId: 421611,
    },
    arbgoerli: {
      url: `https://goerli-rollup.arbitrum.io/rpc`,
      accounts: [pk],
      chainId: 421613,
    },
  },
  solidity: {
    compilers: [
      { version: '0.8.15' },
      {
        version: '0.8.18',
        settings: {
          // use IR for in production and development
          // do not use IR for generating coverage report (to prevent compilation error)
          viaIR: !process.env.COVERAGE_CHECK,
          optimizer: {
            enabled: true,
            runs: 256,
          },
          metadata: {
            // do not include the metadata hash, since this is machine dependent
            // and we want all generated code to be deterministic
            // https://docs.soliditylang.org/en/v0.8.10/metadata.html
            bytecodeHash: 'none',
          },
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
      {
        version: '0.8.10',
        settings: {
          optimizer: {
            enabled: true,
            runs: 340,
          },
          metadata: {
            // do not include the metadata hash, since this is machine dependent
            // and we want all generated code to be deterministic
            // https://docs.soliditylang.org/en/v0.8.10/metadata.html
            bytecodeHash: 'none',
          },
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
    ],
  },
  dependencyCompiler: {
    paths: [
      '@uniswap/v3-periphery/contracts/lens/Quoter.sol',
      '@uniswap/v3-periphery/contracts/SwapRouter.sol',
      '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
      '@uniswap/v3-periphery/contracts/NonfungiblePositionManager.sol',
      '@ragetrade/core/contracts/utils/TimelockControllerWithMinDelayOverride.sol',
    ],
  },
  typechain: {
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY,
  },
  mocha: {
    timeout: 4000000,
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
    enabled: !!process.env.REPORT_GAS, // REPORT_GAS=true yarn test
    coinmarketcap: process.env.COINMARKETCAP, // https://coinmarketcap.com/api/pricing/
  },
  contractSizer: {
    strict: true,
  },
  storageLayoutChanges: {
    contracts: [
      'DnGmxJuniorVault',
      'DnGmxSeniorVault',
      'DnGmxBatchingManager',
      'DnGmxBatchingManagerGlp',
      'DnGmxTraderHedgeStrategy',
    ],
    fullPath: false,
  },
  namedAccounts: {
    deployer: LEDGER_ADDRESS
      ? `ledger://${LEDGER_ADDRESS}`
      : {
          default: 0,
        },
  },
};
