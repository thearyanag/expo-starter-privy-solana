import type { EventEmitter, SendTransactionOptions, WalletName } from '@solana/wallet-adapter-base';
import {
  BaseMessageSignerWalletAdapter,
  isIosAndRedirectable,
  isVersionedTransaction,
  scopePollingDetectionStrategy,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import type {
  Connection,
  TransactionSignature,
  TransactionVersion,
} from '@solana/web3.js';
import { PublicKey, Transaction, VersionedTransaction, SendOptions } from '@solana/web3.js';
import {
  useEmbeddedSolanaWallet,
  PrivyEmbeddedSolanaWalletProvider,
} from '@privy-io/expo';

interface PrivyWalletEvents {
  connect(...args: unknown[]): unknown;
  disconnect(...args: unknown[]): unknown;
  accountChanged(newPublicKey: PublicKey): unknown;
}

interface PrivyProviderResponse {
  signature?: string;
}

interface PlutoWindow extends Window {
  pluto?: {
    solana?: PlutoWallet;
  };
  solana?: PlutoWallet;
}

declare const window: PlutoWindow;

interface PrivyWalletProvider extends EventEmitter<PrivyWalletEvents> {
  request(params: {
    method: string;
    params: {
      message: string;
    };
  }): Promise<PrivyProviderResponse>;
}

interface PrivyEmbeddedWallet {
  address: string;
  getProvider(): Promise<PrivyWalletProvider>;
}

interface PlutoWalletEvents {
  connect(...args: unknown[]): unknown;
  disconnect(...args: unknown[]): unknown;
  accountChanged(newPublicKey: PublicKey): unknown;
}


interface PlutoWallet extends EventEmitter<PlutoWalletEvents> {
  isPluto?: boolean;
  publicKey?: { toBytes(): Uint8Array };
  isConnected: boolean;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  signAndSendTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    options?: SendOptions
  ): Promise<{ signature: TransactionSignature }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface PlutoWalletAdapterConfig {
  provider: PrivyEmbeddedSolanaWalletProvider | null;
}

export const PlutoWalletAdapterConfig = 'Pluto' as WalletName<'Pluto'>;

export class PlutoWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = PlutoWalletAdapterConfig;
  url = 'https://plutomobile.app';
  icon = 'data:image/jpeg;base64,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';
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

  private _connecting: boolean;
  private _wallet: PlutoWallet | null;
  private _publicKey: PublicKey | null;
  private _readyState: WalletReadyState =
    typeof window === 'undefined' || typeof document === 'undefined'
      ? WalletReadyState.Unsupported
      : WalletReadyState.NotDetected;
  private _provider: PrivyEmbeddedSolanaWalletProvider | null;

  constructor(config: PlutoWalletAdapterConfig = {
    provider: null,
  }) {
    if (!config.provider) {
      throw new Error("Provider is required");
    }
    super();
    this._connecting = true;
    this._readyState = WalletReadyState.Installed;
    this._wallet = null;
    this._publicKey = new PublicKey(config.provider._publicKey);
    this._provider = config.provider;
  }

  get publicKey(): PublicKey | null {
    if (!this._provider) return null;
    return this._publicKey;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  get readyState(): WalletReadyState {
    return this._readyState;
  }

  async autoConnect(): Promise<void> {
    if (this.readyState === WalletReadyState.Installed) {
      await this.connect();
    } else {
      this.emit('error', new WalletNotReadyError());
    }
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this.connecting) return;

      if (this.readyState === WalletReadyState.Loadable) {
        // redirect to the Pluto /browse universal link
        // this will open the current URL in the Pluto in-wallet browser
        const url = encodeURIComponent(window.location.href);
        const ref = encodeURIComponent(window.location.origin);
        window.location.href = `https://plutomobile.app/ul/browse/${url}?ref=${ref}`;
        return;
      }

      if (this.readyState !== WalletReadyState.Installed) throw new WalletNotReadyError();

      this._connecting = true;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const wallet = window.pluto?.solana || window.solana!;

      if (!wallet.isConnected) {
        try {
          await this.connect();
        } catch (error: any) {
          throw new WalletConnectionError(error?.message, error);
        }
      }

      if (!this._provider) throw new WalletNotConnectedError();

      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(this._provider._publicKey);
      } catch (error: any) {
        throw new WalletPublicKeyError(error?.message, error);
      }

      wallet.on('disconnect', this._disconnected);
      wallet.on('accountChanged', this._accountChanged);

      this._wallet = wallet;
      this._publicKey = publicKey;

      this.emit('connect', publicKey);
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off('disconnect', this._disconnected);
      wallet.off('accountChanged', this._accountChanged);

      this._provider = null;
      this._wallet = null;
      this._publicKey = null;

      try {
        await wallet.disconnect();
      } catch (error: any) {
        this.emit('error', new WalletDisconnectionError(error?.message, error));
      }
    }

    this.emit('disconnect');
  }

  async sendTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    connection: Connection,
    options: SendTransactionOptions = {}
  ): Promise<TransactionSignature> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      if (!this._provider) throw new WalletNotConnectedError();

      try {
        const { signers, ...sendOptions } = options;

        if (isVersionedTransaction(transaction)) {
          signers?.length && transaction.sign(signers);
        } else {
          transaction = (await this.prepareTransaction(transaction, connection, sendOptions)) as T;
          signers?.length && (transaction as Transaction).partialSign(...signers);
        }

        sendOptions.preflightCommitment = sendOptions.preflightCommitment || connection.commitment;

        const { signature } = await this._provider.request({
          method: 'signAndSendTransaction',
          params: {
            'transaction': transaction,
            'connection': connection,
          }
        });
        return signature;
      } catch (error: any) {
        if (error instanceof WalletError) throw error;
        throw new WalletSendTransactionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      if (!this._provider) throw new WalletNotConnectedError();

      try {
        const { signedTransaction } = await this._provider.request({
          method: 'signTransaction',
          params: {
            'transaction': transaction
          }
        });
        return signedTransaction;
      } catch (error: any) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      if (!this._provider) throw new WalletNotConnectedError();

      try {
        const txs = []
        for (const tx of transactions) {
          txs.push(await this.signTransaction(tx));
        }
        return txs || transactions;
      } catch (error: any) {
        throw new WalletSignTransactionError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      if (!this._provider) throw new WalletNotConnectedError();

      try {
        const { signature } = await this._provider.request({
          method: 'signMessage',
          params: {
            "message": message.toString()
          }
        });
        return new Uint8Array(Buffer.from(signature, 'base64'));
      } catch (error: any) {
        throw new WalletSignMessageError(error?.message, error);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    }
  }


  private _disconnected = () => {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off('disconnect', this._disconnected);
      wallet.off('accountChanged', this._accountChanged);

      this._provider = null;
      this._wallet = null;
      this._publicKey = null;

      this.emit('error', new WalletDisconnectedError());
      this.emit('disconnect');
    }
  };

  private _accountChanged = (newPublicKey: PublicKey) => {
    const publicKey = this._publicKey;
    if (!publicKey) return;

    try {
      newPublicKey = new PublicKey(newPublicKey.toBytes());
    } catch (error: any) {
      this.emit('error', new WalletPublicKeyError(error?.message, error));
      return;
    }

    if (publicKey.equals(newPublicKey)) return;

    this._publicKey = newPublicKey;
    this.emit('connect', newPublicKey);
  };
}

// Hook to create and manage the Pluto wallet adapter
export async function usePlutoWalletAdapter(): Promise<PlutoWalletAdapter> {
  const { wallets } = useEmbeddedSolanaWallet();
  const provider = await wallets![0].getProvider();

  const adapter = new PlutoWalletAdapter({
    provider: provider
  });
  return adapter;
} 