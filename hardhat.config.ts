import '@nomiclabs/hardhat-waffle';
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
        blockNumber: 22049346,
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
    arbtest: {
      url: `https://rinkeby.arbitrum.io/rpc`,
      accounts: [pk],
      chainId: 421611,
    },
  },
  solidity: {
    compilers: [
      { version: '0.8.15' },
      {
        version: '0.8.17',
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
    paths: ['@uniswap/v3-periphery/contracts/lens/QuoterV3.sol', '@uniswap/v3-periphery/contracts/SwapRouter.sol'],
  },
  typechain: {
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
  },
  etherscan: {
    apiKey: {
      arbitrumTestnet: process.env.ETHERSCAN_KEY,
    },
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
    contracts: ['DnGmxJuniorVault', 'DnGmxSeniorVault', 'DnGmxBatchingManager'],
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
