import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useWallet } from './WalletContext';
import { PlutoWalletAdapter } from './PrivyWalletAdapter';
import { PublicKey, Transaction, VersionedTransaction, TransactionVersion } from '@solana/web3.js';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useEmbeddedSolanaWallet, PrivyEmbeddedSolanaWalletProvider } from '@privy-io/expo';
import type {
  DEPRECATED_WalletsWindow,
  Wallet,
  WalletEventsWindow,
  WindowRegisterWalletEvent,
  WindowRegisterWalletEventCallback,
} from '@wallet-standard/base';

// Type-safe wallet interface matching PlutoWalletAdapter for injection
interface InjectedWalletAdapter {
  name: string;
  url: string;
  icon: string;
  supportedTransactionVersions: ReadonlySet<TransactionVersion>;
  publicKey: string | null;
  connecting: boolean;
  connected: boolean;
  readyState: WalletReadyState;
  autoConnect(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>;
  signAllTransactions(transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

interface WalletMessage {
  type: 'WALLET_CONNECT' | 'WALLET_DISCONNECT' | 'WALLET_SIGN_TRANSACTION' | 'WALLET_SIGN_MESSAGE' | 'WALLET_SEND_TRANSACTION' | 'WALLET_SIGN_SEND_TRANSACTION' | 'WALLET_SIGN_IN';
  data: {
    transaction?: Transaction | VersionedTransaction;
    transactions?: (Transaction | VersionedTransaction)[];
    message?: Uint8Array;
    options?: any;
    input?: any;
    silent?: boolean;
  };
}

// Type guard to validate wallet messages
function isWalletMessage(obj: Record<string, any>): obj is WalletMessage {
  return (
    typeof obj.type === 'string' &&
    ['WALLET_CONNECT', 'WALLET_DISCONNECT', 'WALLET_SIGN_TRANSACTION', 'WALLET_SIGN_MESSAGE', 'WALLET_SEND_TRANSACTION', 'WALLET_SIGN_SEND_TRANSACTION', 'WALLET_SIGN_IN'].includes(obj.type) &&
    typeof obj.data === 'object' &&
    obj.data !== null
  );
}

interface BrowserScreenProps {
  onClose: () => void;
}

export const BrowserScreen: React.FC<BrowserScreenProps> = ({ onClose }) => {
  const [url, setUrl] = useState('https://example-nextjs-dallet-connect.vercel.app/');
  const [currentUrl, setCurrentUrl] = useState('https://example-nextjs-dallet-connect.vercel.app/');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<WalletMessage | null>(null);

  const webViewRef = useRef<WebView>(null);
  const { wallet, isLoading } = useWallet();
  const { wallets } = useEmbeddedSolanaWallet();

  useEffect(() => {
    if (wallet) {
      wallet.connect();
      console.log("wallet connected", wallet.publicKey);
    }
  }, [wallet]);

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  const navigateToUrl = () => {
    let formattedUrl = url.trim();

    // Add https:// if no protocol is specified
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    setCurrentUrl(formattedUrl);
    setUrl(formattedUrl);
  };

  const goBack = () => {
    webViewRef.current?.goBack();
  };

  const goForward = () => {
    webViewRef.current?.goForward();
  };

  const reload = () => {
    webViewRef.current?.reload();
  };

  const injectWalletScript = () => {
    if (!wallet) {
      console.log('No wallet available to inject');
      return;
    }

    const plutoWallet = wallet;
    
    const walletData: InjectedWalletAdapter = {
      name: plutoWallet.name,
      url: plutoWallet.url,
      icon: plutoWallet.icon,
      supportedTransactionVersions: plutoWallet.supportedTransactionVersions,
      publicKey: plutoWallet.publicKey?.toString() || null,
      connected: plutoWallet.connected,
      connecting: plutoWallet.connecting,
      readyState: plutoWallet.readyState,
      autoConnect: async () => {},
      connect: async () => {},
      disconnect: async () => {},
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
      signMessage: async (msg) => msg,
    };

    webViewRef.current?.injectJavaScript(`
      // Define wallet standard constants
      const StandardConnect = 'standard:connect';
      const StandardDisconnect = 'standard:disconnect';
      const StandardEvents = 'standard:events';
      const SolanaSignAndSendTransaction = 'solana:signAndSendTransaction';
      const SolanaSignTransaction = 'solana:signTransaction';
      const SolanaSignMessage = 'solana:signMessage';
      const SolanaSignIn = 'solana:signIn';
      const PlutoNamespace = 'pluto:';
      
      // Solana chains
      const SOLANA_CHAINS = [
        'solana:mainnet',
        'solana:devnet', 
        'solana:testnet',
        'solana:localnet'
      ];

      // Account class
      class PlutoWalletAccount {
        constructor({ address, publicKey, label, icon }) {
          this._address = address;
          this._publicKey = publicKey;
          this._chains = SOLANA_CHAINS.slice();
          this._features = [SolanaSignAndSendTransaction, SolanaSignTransaction, SolanaSignMessage];
          this._label = label;
          this._icon = icon;

        }
        
        get address() { return this._address; }
        get publicKey() { return this._publicKey ? this._publicKey.slice() : new Uint8Array(); }
        get chains() { return this._chains.slice(); }
        get features() { return this._features.slice(); }
        get label() { return this._label; }
        get icon() { return this._icon; }
      }

      // Main wallet class following wallet standard
      class PlutoWallet {
        constructor() {
          this._listeners = {};
          this._version = '1.0.0';
          this._name = '${walletData.name}';
          this._icon = '${walletData.icon}';
          this._account = null;
          this._connecting = ${walletData.connecting};
          this._connected = ${walletData.connected};
          
          if (${walletData.publicKey ? `true` : 'false'}) {
            this._account = new PlutoWalletAccount({
              address: '${walletData.publicKey}',
              publicKey: new TextEncoder().encode('${walletData.publicKey}'), // Simplified for demo
              label: 'Pluto Wallet',
              icon: '${walletData.icon}'
            });
          }
          
          // Object.freeze(this);
        }
        
        get version() { return this._version; }
        get name() { return this._name; }
        get icon() { return this._icon; }
        get chains() { return SOLANA_CHAINS.slice(); }
        get accounts() { return this._account ? [this._account] : []; }
        
        get features() {
          return {
            [StandardConnect]: {
              version: '1.0.0',
              connect: this._connect.bind(this)
            },
            [StandardDisconnect]: {
              version: '1.0.0', 
              disconnect: this._disconnect.bind(this)
            },
            [StandardEvents]: {
              version: '1.0.0',
              on: this._on.bind(this)
            },
            [SolanaSignAndSendTransaction]: {
              version: '1.0.0',
              supportedTransactionVersions: ['legacy', 0],
              signAndSendTransaction: this._signAndSendTransaction.bind(this)
            },
            [SolanaSignTransaction]: {
              version: '1.0.0',
              supportedTransactionVersions: ['legacy', 0], 
              signTransaction: this._signTransaction.bind(this)
            },
            [SolanaSignMessage]: {
              version: '1.0.0',
              signMessage: this._signMessage.bind(this)
            },
            [SolanaSignIn]: {
              version: '1.0.0',
              signIn: this._signIn.bind(this)
            },
            [PlutoNamespace]: {
              pluto: this
            }
          };
        }
        
        _on = (event, listener) => {
          this._listeners[event] = this._listeners[event] || [];
          this._listeners[event].push(listener);
          return () => this._off(event, listener);
        }
        
        _off = (event, listener) => {
          if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== listener);
          }
        }
        
        _emit = (event, ...args) => {
          if (this._listeners[event]) {
            this._listeners[event].forEach(listener => listener.apply(null, args));
          }
        }
        
        _connect = async ({ silent } = {}) => {
          console.log('Wallet connect requested, silent:', silent);
          return new Promise((resolve, reject) => {
            const messageHandler = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === 'WALLET_CONNECT_RESPONSE') {
                  window.removeEventListener('message', messageHandler);
                  if (data.success) {
                    this._connected = true;
                    this._connecting = false;
                    if (data.publicKey && !this._account) {
                      this._account = new PlutoWalletAccount({
                        address: data.publicKey,
                        publicKey: new TextEncoder().encode(data.publicKey),
                        label: 'Pluto Wallet',
                        icon: this._icon
                      });
                    }
                    this._emit('change', { accounts: this.accounts });
                    resolve({ accounts: this.accounts });
                  } else {
                    reject(new Error(data.error || 'Connection failed'));
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            };
            
            window.addEventListener('message', messageHandler);
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_CONNECT',
              data: { silent }
            }));
            
            // Timeout after 30 seconds
            setTimeout(() => {
              window.removeEventListener('message', messageHandler);
              reject(new Error('Connection timeout'));
            }, 30000);
          });
        }
        
        _disconnect = async () => {
          console.log('Wallet disconnect requested');
          return new Promise((resolve) => {
            this._connected = false;
            this._account = null;
            this._emit('change', { accounts: this.accounts });
            
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_DISCONNECT', 
            data: {}
          }));
            resolve();
          });
        }
        
        _signTransaction = async (input) => {
          console.log('Sign transaction requested');
          return new Promise((resolve, reject) => {
            const messageHandler = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === 'WALLET_SIGN_TRANSACTION_RESPONSE') {
                  window.removeEventListener('message', messageHandler);
                  if (data.success) {
                    resolve({ signedTransaction: data.signedTransaction });
                  } else {
                    reject(new Error(data.error || 'Signing failed'));
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            };
            
            window.addEventListener('message', messageHandler);
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_SIGN_TRANSACTION',
              data: { transaction: input.transaction }
            }));
          });
        }
        
        _signAndSendTransaction = async (input) => {
          console.log('Sign and send transaction requested');
          return new Promise((resolve, reject) => {
            const messageHandler = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === 'WALLET_SIGN_SEND_TRANSACTION_RESPONSE') {
                  window.removeEventListener('message', messageHandler);
                  if (data.success) {
                    resolve({ signature: data.signature });
                  } else {
                    reject(new Error(data.error || 'Transaction failed'));
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            };
            
            window.addEventListener('message', messageHandler);
          window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'WALLET_SIGN_SEND_TRANSACTION',
              data: { transaction: input.transaction, options: input.options }
            }));
          });
        }
        
        _signMessage = async (input) => {
          console.log('Sign message requested');
          return new Promise((resolve, reject) => {
            const messageHandler = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === 'WALLET_SIGN_MESSAGE_RESPONSE') {
                  window.removeEventListener('message', messageHandler);
                  window.addDebugMessage('Sign message response received: ' + JSON.stringify(data));
                  if (data.success) {
                    resolve({ signedMessage: input.message, signature: data.signature });
                  } else {
                    reject(new Error(data.error || 'Message signing failed'));
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            };
            
            window.addEventListener('message', messageHandler);
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_SIGN_MESSAGE',
              data: { message: input.message }
            }));
          });
        }
        
        _signIn = async (input) => {
          console.log('Sign in requested');
          return new Promise((resolve, reject) => {
            const messageHandler = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === 'WALLET_SIGN_IN_RESPONSE') {
                  window.removeEventListener('message', messageHandler);
                  if (data.success) {
                    resolve(data.output);
                  } else {
                    window.alert("hi data failure");
                    reject(new Error(data.error || 'Sign in failed'));
                  }
                }
              } catch (e) {
                // Ignore parsing errors
                window.alert("hi errors");
              }
            };
            
            window.addEventListener('message', messageHandler);
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'WALLET_SIGN_IN',
              data: { input }
            }));

          });
        }
      }

      // Create wallet instance
      const plutoWallet = new PlutoWallet();
      
      // Register wallet using wallet standard events
      class RegisterWalletEvent extends Event {
        constructor(callback) {
          super('wallet-standard:register-wallet', {
            bubbles: false,
            cancelable: false,
            composed: false,
          });
          this._detail = callback;
        }
        
        get detail() {
          return this._detail;
        }
        
        get type() {
          return 'wallet-standard:register-wallet';
        }
      }
      
      // Registration function
      function registerWallet(wallet) {
        const callback = ({ register }) => register(wallet);
        try {
          window.dispatchEvent(new RegisterWalletEvent(callback));
        } catch (error) {
          console.log('wallet-standard:register-wallet event could not be dispatched', error);
        }
        try {
          window.addEventListener('wallet-standard:app-ready', ({ detail: api }) => 
            callback(api)
          );
        } catch (error) {
          console.log('wallet-standard:app-ready event listener could not be added', error);
        }
      }
      
      // Register the wallet
      registerWallet(plutoWallet);
      
      // Legacy compatibility
      window.solana = plutoWallet;
      window.pluto = {
        solana: plutoWallet,
        isPluto: true
      };
      
      // Ensure navigator.wallets exists
      if (!window.navigator.wallets) {
        window.navigator.wallets = [];
      }
      
      // Add to deprecated wallets array for legacy support
      try {
        window.navigator.wallets.push(({ register }) => register(plutoWallet));
      } catch (error) {
        console.log('window.navigator.wallets could not be pushed', error);
      }
      
      // Set detection flag
      window.isPlutoWalletInjected = true;
      
      // Create simple debug console
      if (typeof document !== 'undefined' && !document.getElementById('wallet-debug-panel')) {
        // Global message list
        window.debugMessages = [];
        window.addDebugMessage = (message) => {
          const timestamp = new Date().toLocaleTimeString();
          window.debugMessages.unshift(\`[\${timestamp}] \${message}\`);
          if (window.debugMessages.length > 50) window.debugMessages = window.debugMessages.slice(0, 50);
          updateDebugPanel();
        };
        
        const debugPanel = document.createElement('div');
        debugPanel.id = 'wallet-debug-panel';
        let isMinimized = false;
        
        const updateDebugPanel = () => {
          if (isMinimized) {
            debugPanel.style.cssText = \`
              position: fixed;
              bottom: 10px;
              right: 10px;
              width: 60px;
              height: 30px;
              background: #1a1a2e;
              color: #fff;
              border-radius: 6px;
              font-family: monospace;
              font-size: 12px;
              z-index: 999999;
              border: 1px solid #4f46e5;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            \`;
            debugPanel.innerHTML = \`
              <div onclick="toggleDebugPanel()" style="text-align: center;">📝</div>
            \`;
          } else {
            debugPanel.style.cssText = \`
              position: fixed;
              bottom: 10px;
              right: 10px;
              width: 350px;
              max-height: 400px;
              background: #1a1a2e;
              color: #fff;
              padding: 15px;
              border-radius: 8px;
              font-family: monospace;
              font-size: 11px;
              z-index: 999999;
              border: 1px solid #4f46e5;
              overflow-y: auto;
            \`;
            debugPanel.innerHTML = \`
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong style="color: #4f46e5;">Debug Console</strong>
                <div>
                  <button onclick="window.debugMessages = []; updateDebugPanel();" style="background: #ef4444; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; margin-right: 5px; font-size: 10px;">Clear</button>
                  <button onclick="toggleDebugPanel()" style="background: #f59e0b; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px;">−</button>
                </div>
              </div>
              <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; max-height: 300px; overflow-y: auto;">
                \${window.debugMessages.length > 0 ? window.debugMessages.map(msg => \`<div style="margin: 2px 0; color: #e5e7eb;">\${msg}</div>\`).join('') : '<div style="color: #9ca3af;">No messages...</div>'}
              </div>
            \`;
          }
        };
        
        window.toggleDebugPanel = () => {
          isMinimized = !isMinimized;
          updateDebugPanel();
        };
        
        updateDebugPanel();
        document.body.appendChild(debugPanel);
        
        // Add initial messages
        window.addDebugMessage('Debug console initialized');
        window.addDebugMessage('Pluto Wallet registered');
      }
      
            console.log('✅ Pluto Wallet registered successfully using wallet standard');
      window.ReactNativeWebView?.postMessage('Wallet registered: ' + JSON.stringify({
        name: "${walletData.name}",
        publicKey: ${walletData.publicKey ? `"${walletData.publicKey}"` : 'null'},
        connected: ${walletData.connected},
        readyState: "${walletData.readyState}",
        accounts: plutoWallet.accounts.length
      }));
      true;
    `);
  };

  const sendResponseToWebView = (responseType: string, success: boolean, data?: any, error?: string) => {
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({
          type: '${responseType}',
          success: ${success},
          ${data ? `...${JSON.stringify(data)},` : ''}
          ${error ? `error: '${error}'` : ''}
        })
      }));
      true;
    `);
  };

  const decodeMessage = (message: any): string => {
    try {
      if (typeof message === 'object' && message !== null) {
        // Convert object with numeric keys to Uint8Array, then to string
        const uint8Array = new Uint8Array(Object.values(message) as number[]);
        return new TextDecoder().decode(uint8Array);
      }
      if (message instanceof Uint8Array) {
        return new TextDecoder().decode(message);
      }
      if (typeof message === 'string') {
        return message;
      }
      return JSON.stringify(message);
    } catch (error) {
      console.log('Error decoding message:', error);
      return 'Unable to decode message';
    }
  };

  const showConfirmationModal = (message: WalletMessage) => {
    setPendingRequest(message);
    setShowConfirmModal(true);
  };

  const handleConfirmAction = async () => {
    if (!pendingRequest) return;
    
    setShowConfirmModal(false);
    await processWalletRequest(pendingRequest);
    setPendingRequest(null);
  };

  const handleCancelAction = () => {
    if (!pendingRequest) return;
    
    setShowConfirmModal(false);
    
    // Send error response to WebView
    switch (pendingRequest.type) {
      case 'WALLET_SIGN_MESSAGE':
        sendResponseToWebView('WALLET_SIGN_MESSAGE_RESPONSE', false, null, 'User cancelled');
        break;
      case 'WALLET_SIGN_TRANSACTION':
        sendResponseToWebView('WALLET_SIGN_TRANSACTION_RESPONSE', false, null, 'User cancelled');
        break;
      case 'WALLET_SIGN_SEND_TRANSACTION':
        sendResponseToWebView('WALLET_SIGN_SEND_TRANSACTION_RESPONSE', false, null, 'User cancelled');
        break;
      case 'WALLET_SIGN_IN':
        sendResponseToWebView('WALLET_SIGN_IN_RESPONSE', false, null, 'User cancelled');
        break;
      default:
        break;
    }
    
    setPendingRequest(null);
  };

  const processWalletRequest = async (message: WalletMessage) => {
    console.log('Processing wallet request:', message);
    
    if (!wallets || wallets.length === 0) {
      Alert.alert('Wallet Error', 'No Privy wallet available');
      return;
    }

    const privyProvider = await wallets[0].getProvider();
    
    switch (message.type) {
      case 'WALLET_SIGN_MESSAGE':
        try {
          if (message.data.message) {
            // Convert the message object to proper format
            let messageToSign: string;
            if (typeof message.data.message === 'object' && message.data.message !== null) {
              if (message.data.message instanceof Uint8Array) {
                messageToSign = new TextDecoder().decode(message.data.message);
              } else {
                // Assume it's an object with numeric keys (like the logs show)
                const uint8Array = new Uint8Array(Object.values(message.data.message) as number[]);
                messageToSign = new TextDecoder().decode(uint8Array);
              }
            } else {
              messageToSign = String(message.data.message);
            }

            const response = await privyProvider.request({
              method: 'signMessage',
              params: {
                message: messageToSign
              }
            });
            
            console.log('Privy response:', response);
            
            sendResponseToWebView('WALLET_SIGN_MESSAGE_RESPONSE', true, {
              signature: response.signature
            });
            Alert.alert('Message Signed', 'Message signed successfully');
            console.log('Message signature:', response.signature);
          }
        } catch (error) {
          console.log('Message signing error:', error);
          sendResponseToWebView('WALLET_SIGN_MESSAGE_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Signing Error', `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_SIGN_TRANSACTION':
        try {
          if (message.data.transaction) {
            const response = await privyProvider.request({
              method: 'signTransaction',
              params: {
                transaction: message.data.transaction
              }
            });
            
            sendResponseToWebView('WALLET_SIGN_TRANSACTION_RESPONSE', true, {
              signedTransaction: response.signedTransaction
            });
            Alert.alert('Transaction Signed', 'Transaction signed successfully');
            console.log('Signed transaction:', response.signedTransaction);
          }
        } catch (error) {
          console.log('Transaction signing error:', error);
          sendResponseToWebView('WALLET_SIGN_TRANSACTION_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Signing Error', `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_SIGN_SEND_TRANSACTION':
        try {
          if (message.data.transaction) {
            // For sign and send, we could implement sending to network here
            // For now, just sign and return a mock signature
            const response = await privyProvider.request({
              method: 'signTransaction',
              params: {
                transaction: message.data.transaction
              }
            });
            
            // Mock transaction signature (in real implementation, send to network)
            const mockSignature = 'signature_' + Date.now().toString(36);
            sendResponseToWebView('WALLET_SIGN_SEND_TRANSACTION_RESPONSE', true, {
              signature: mockSignature
            });
            Alert.alert('Transaction Sent', 'Transaction signed and sent successfully');
            console.log('Signed and sent transaction:', response.signedTransaction);
          }
        } catch (error) {
          console.log('Transaction sign and send error:', error);
          sendResponseToWebView('WALLET_SIGN_SEND_TRANSACTION_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Transaction Error', `Failed to sign and send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      case 'WALLET_SIGN_IN':
        try {
          // Simulate sign in functionality using wallet address
          const signInOutput = {
            account: {
              address: wallets[0].address,
              publicKey: wallets[0].address
            },
            signature: 'signin_signature_' + Date.now().toString(36)
          };
          sendResponseToWebView('WALLET_SIGN_IN_RESPONSE', true, {
            output: signInOutput
          });
          Alert.alert('Sign In', 'Sign in successful');
          console.log('Sign in completed:', signInOutput);
        } catch (error) {
          console.log('Sign in error:', error);
          sendResponseToWebView('WALLET_SIGN_IN_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Sign In Error', `Failed to sign in: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      default:
        console.log('Unknown wallet message type in processWalletRequest');
    }
  };

  const handleWalletMessage = async (message: WalletMessage) => {
    console.log('Handling wallet message:', message);
    
    // Handle connect/disconnect operations directly (no confirmation needed)
    if (message.type === 'WALLET_CONNECT') {
      try {
        if (!wallets || wallets.length === 0) {
          sendResponseToWebView('WALLET_CONNECT_RESPONSE', false, null, 'No Privy wallet available');
          Alert.alert('Wallet Error', 'No Privy wallet available');
          return;
        }
        
        sendResponseToWebView('WALLET_CONNECT_RESPONSE', true, {
          publicKey: wallets[0].address
        });
        Alert.alert('Wallet', 'Connected successfully!');
        // Re-inject updated wallet state
        setTimeout(() => injectWalletScript(), 100);
      } catch (error) {
        console.log('Wallet connect error:', error);
        sendResponseToWebView('WALLET_CONNECT_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
        Alert.alert('Wallet Error', `Failed to connect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }
    
    if (message.type === 'WALLET_DISCONNECT') {
      try {
        Alert.alert('Wallet', 'Disconnected successfully!');
        // Re-inject updated wallet state
        setTimeout(() => injectWalletScript(), 100);
      } catch (error) {
        console.log('Wallet disconnect error:', error);
        Alert.alert('Wallet Error', `Failed to disconnect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }
    
    // For signing operations, show confirmation modal
    if (message.type === 'WALLET_SIGN_MESSAGE' || 
        message.type === 'WALLET_SIGN_TRANSACTION' || 
        message.type === 'WALLET_SIGN_SEND_TRANSACTION' || 
        message.type === 'WALLET_SIGN_IN') {
      showConfirmationModal(message);
      return;
    }
    
    // Handle other operations
    switch (message.type) {
      case 'WALLET_SEND_TRANSACTION':
        Alert.alert('Send Transaction', 'Send transaction requested from WebView');
        console.log('Send transaction data:', message.data.transaction);
        break;
        
      default:
        // TypeScript will ensure this case is never reached due to exhaustive checking
        const exhaustiveCheck: never = message.type;
        console.log('Unknown wallet message type:', exhaustiveCheck);
    }
  };

  const injectTestScript = () => {
    webViewRef.current?.injectJavaScript(`
      window.testRuntime = 'injected at runtime';
      window.currentTime = new Date().toISOString();
      console.log('Runtime injection successful');
      console.log('window.test:', window.test);
      console.log('window.testRuntime:', window.testRuntime);
      
      // Send debug info back to React Native (use var to avoid duplicate declaration)
      var debugInfo = {
        test: window.test,
        testRuntime: window.testRuntime,
        currentTime: window.currentTime,
        location: window.location.href,
        walletInjected: !!window.solanaWallet
      };
      window.ReactNativeWebView?.postMessage('Runtime debug: ' + JSON.stringify(debugInfo));
      true;
    `);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with navigation controls */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.navigationButtons}>
          <TouchableOpacity style={styles.navButton} onPress={goBack}>
            <Text style={styles.navButtonText}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={goForward}>
            <Text style={styles.navButtonText}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={reload}>
            <Text style={styles.navButtonText}>⟳</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={injectTestScript}>
            <Text style={styles.navButtonText}>JS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={injectWalletScript}>
            <Text style={styles.navButtonText}>💰</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onNavigationStateChange={(navState) => {
            setUrl(navState.url);
            console.log('Navigation changed to:', navState.url);
          }}
          onLoadEnd={() => {
            console.log('Page load ended');
            // Auto-inject wallet after page loads
            setTimeout(() => {
              injectWalletScript();
            }, 500); // Small delay to ensure page is ready
          }}
          onError={(error) => {
            Alert.alert('Error', 'Failed to load the webpage');
          }}
          onHttpError={(error) => {
            console.log('HTTP Error', error);
            Alert.alert('HTTP Error', 'Failed to load the webpage');
          }}
          onMessage={(event) => {
            const message = event.nativeEvent.data;
            console.log('WebView message:', message);
            
            // Handle wallet requests
            try {
              const parsed = JSON.parse(message);
              
              if (parsed && typeof parsed === 'object' && isWalletMessage(parsed as Record<string, any>)) {
                handleWalletMessage(parsed as WalletMessage);
                return;
              }
            } catch (error) {
              // Not JSON or invalid format, continue with regular message handling
              console.log('Failed to parse message as JSON:', error);
            }
            
            // Show debug messages as alerts for easy debugging
            if (message.includes('debug') || message.includes('window.test') || message.includes('Wallet injected')) {
              Alert.alert('Debug Info', message);
            }
          }}
          startInLoadingState={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          webviewDebuggingEnabled={true}
          injectedJavaScriptBeforeContentLoaded={`
            // Prepare global variables
            window.test = 'test';
            window.myObject = { key: 'value', number: 42 };
            console.log('Script injected before content loaded');
            
            // Prepare wallet interface placeholders with proper typing
            window.solanaWallet = null;
            window.solana = null;
            window.pluto = null;
            
            // Initialize navigator.wallets if it doesn't exist
            if (!window.navigator) {
              window.navigator = {};
            }
            if (!window.navigator.wallets) {
              window.navigator.wallets = [];
            }
            
            // Create wallet detection flag
            window.isPlutoWalletInjected = false;
            
            console.log('Wallet standard infrastructure prepared');
            window.ReactNativeWebView?.postMessage('Before content: Wallet placeholders and standard infrastructure prepared');
            true;
          `}
          injectedJavaScript={`
            console.log('Script injected after content loaded');
            console.log('window.test:', window.test);
            window.ReactNativeWebView?.postMessage('After content: window.test = ' + window.test);
            true;
          `}
        />
      </View>

      {/* URL Input at bottom */}
      <View style={styles.urlInputContainer}>
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={setUrl}
          placeholder="Enter URL here..."
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={navigateToUrl}
        />
        <TouchableOpacity style={styles.goButton} onPress={navigateToUrl}>
          <Text style={styles.goButtonText}>GO</Text>
        </TouchableOpacity>
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelAction}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {pendingRequest?.type === 'WALLET_SIGN_MESSAGE' && 'Sign Message'}
                {pendingRequest?.type === 'WALLET_SIGN_TRANSACTION' && 'Sign Transaction'}
                {pendingRequest?.type === 'WALLET_SIGN_SEND_TRANSACTION' && 'Sign & Send Transaction'}
                {pendingRequest?.type === 'WALLET_SIGN_IN' && 'Sign In'}
              </Text>
            </View>
            
            <ScrollView style={styles.modalContent}>
              <Text style={styles.modalSubtitle}>Please confirm this action:</Text>
              
              {pendingRequest?.type === 'WALLET_SIGN_MESSAGE' && (
                <>
                  <Text style={styles.modalLabel}>Message to sign:</Text>
                  <View style={styles.messageContainer}>
                    <Text style={styles.messageText}>
                      {decodeMessage(pendingRequest.data.message)}
                    </Text>
                  </View>
                </>
              )}
              
              {(pendingRequest?.type === 'WALLET_SIGN_TRANSACTION' || 
                pendingRequest?.type === 'WALLET_SIGN_SEND_TRANSACTION') && (
                <>
                  <Text style={styles.modalLabel}>Transaction:</Text>
                  <View style={styles.messageContainer}>
                    <Text style={styles.messageText}>
                      {JSON.stringify(pendingRequest.data.transaction, null, 2)}
                    </Text>
                  </View>
                </>
              )}
              
              {pendingRequest?.type === 'WALLET_SIGN_IN' && (
                <>
                  <Text style={styles.modalLabel}>Sign in request:</Text>
                  <View style={styles.messageContainer}>
                    <Text style={styles.messageText}>
                      Sign in with your wallet
                    </Text>
                    {pendingRequest.data.input && (
                      <Text style={styles.messageText}>
                        Input: {JSON.stringify(pendingRequest.data.input, null, 2)}
                      </Text>
                    )}
                  </View>
                </>
              )}
              
              <Text style={styles.walletInfo}>
                Wallet: {wallets && wallets.length > 0 ? wallets[0].address : 'Not available'}
              </Text>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={handleCancelAction}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={handleConfirmAction}
              >
                <Text style={styles.confirmButtonText}>
                  {pendingRequest?.type === 'WALLET_SIGN_MESSAGE' && 'Sign Message'}
                  {pendingRequest?.type === 'WALLET_SIGN_TRANSACTION' && 'Sign Transaction'}
                  {pendingRequest?.type === 'WALLET_SIGN_SEND_TRANSACTION' && 'Sign & Send'}
                  {pendingRequest?.type === 'WALLET_SIGN_IN' && 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#ff4444',
    borderRadius: 15,
    minWidth: 30,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  navigationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  navButton: {
    padding: 8,
    backgroundColor: '#007AFF',
    borderRadius: 5,
    minWidth: 35,
    alignItems: 'center',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  urlInputContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 10,
  },
  urlInput: {
    flex: 1,
    height: 45,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  goButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '40%',
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 15,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 10,
  },
  messageContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginBottom: 15,
  },
  messageText: {
    fontSize: 13,
    color: '#495057',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  walletInfo: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 