import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { registerWallet } from './register';
import { GhostWallet } from './wallet';
import type { Ghost } from './window';
import { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';

export function initialize(): void {
    const ghost: Ghost = {
        publicKey: new PublicKey(''),
        connect: async () => {
            return { publicKey: new PublicKey('') };
        },
        disconnect: async () => {},
        signAndSendTransaction: async (): Promise<{ signature: string }> => {
            return { signature: '' };
        },
        signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
            return transaction;
        },
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
            return [];
        },
        signMessage: async (message: Uint8Array): Promise<{ signature: Uint8Array }> => {
            return { signature: new Uint8Array() };
        },
        signIn: async (input?: SolanaSignInInput): Promise<SolanaSignInOutput> => {
            return {
                account: {
                    address: "123",
                    publicKey: new Uint8Array(),
                    chains: [],
                    features: [],
                },
                signedMessage: new Uint8Array(),
                signature: new Uint8Array(),
            };
        },
        on: () => {},
        off: () => {},
    }
    registerWallet(new GhostWallet(ghost));
}