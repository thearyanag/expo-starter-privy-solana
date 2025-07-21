import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { PlutoWalletAdapter } from './PrivyWalletAdapter';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';

interface WalletContextType {
  wallet: PlutoWalletAdapter | null;
  isLoading: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [wallet, setWallet] = useState<PlutoWalletAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { wallets } = useEmbeddedSolanaWallet();

  useEffect(() => {
    const initializeWallet = async () => {
      try {
        if (wallets && wallets.length > 0) {
          const provider = await wallets[0].getProvider();
          const adapter = new PlutoWalletAdapter({});
          setWallet(adapter);
        }
      } catch (error) {
        console.error('Failed to initialize wallet:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeWallet();
  }, [wallets]);

  return (
    <WalletContext.Provider value={{ wallet, isLoading }}>
      {children}
    </WalletContext.Provider>
  );
}; 