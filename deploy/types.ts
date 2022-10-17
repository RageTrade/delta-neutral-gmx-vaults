import { ethers } from 'ethers';
import { DeployOptions, DeployResult, Receipt, TxOptions } from 'hardhat-deploy/types';

export const skip = () => true;

type DeployOptionsExtended<ContractFactoryType extends ethers.ContractFactory> = Parameters<
  ContractFactoryType['deploy']
> extends [
  overrides?:
    | (ethers.Overrides & {
        from?: string | Promise<string> | undefined;
      })
    | undefined,
]
  ? Omit<DeployOptions, 'args'>
  : Omit<DeployOptions, 'args'> & { args: Parameters<ContractFactoryType['deploy']> };

export type DeployExtended<ContractFactoryType extends ethers.ContractFactory> = (
  name: string,
  options: DeployOptionsExtended<ContractFactoryType>,
) => Promise<DeployResult>;

export type ExportFunction = (name: string, options: TxOptions, methodName: string, ...args: any[]) => Promise<Receipt>;
