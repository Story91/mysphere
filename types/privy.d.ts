declare module '@privy-io/react-auth' {
  export function useWallets(): {
    wallets: Array<{
      walletClientType: string;
      address?: string;
      [key: string]: any;
    }>;
  };

  export function usePrivy(): {
    ready: boolean;
    authenticated: boolean;
    user: any;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    connectWallet: () => Promise<void>;
    embeddedWallet?: any;
    [key: string]: any;
  };

  export function useLogin(): {
    login: (params?: any) => Promise<void>;
  };

  export function useLogout(): {
    logout: () => Promise<void>;
  };

  export const PrivyProvider: React.FC<{
    appId: string;
    config?: any;
    children: React.ReactNode;
  }>;
}
