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
  icon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+';
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