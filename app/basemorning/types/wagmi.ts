import { type Config } from "wagmi";
import { type ContractFunctions } from "./contract";

declare module "wagmi" {
  interface Register {
    config: Config;
  }

  interface UseContractWriteParameters<
    TAbi = unknown,
    TFunctionName extends string = string,
  > {
    address: `0x${string}`;
    abi: TAbi;
    functionName: TFunctionName;
    account?: `0x${string}`;
  }

  interface UseContractWriteReturnType<
    TAbi = unknown,
    TFunctionName extends string = string,
  > {
    write: () => Promise<void>;
    data: {
      hash: `0x${string}`;
    } | null;
    isLoading: boolean;
  }

  interface UseContractReadParameters<
    TAbi = unknown,
    TFunctionName extends string = string,
  > {
    address: `0x${string}`;
    abi: TAbi;
    functionName: TFunctionName;
    args?: readonly unknown[];
    account?: `0x${string}`;
  }

  interface UseContractReadReturnType<
    TAbi = unknown,
    TFunctionName extends string = string,
  > {
    data: unknown;
    refetch: () => Promise<void>;
    isLoading: boolean;
  }
} 