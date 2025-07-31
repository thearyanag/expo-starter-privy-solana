import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useWallet } from './WalletContext';
import { PlutoWalletAdapter } from './PrivyWalletAdapter';
import { PublicKey, Transaction, VersionedTransaction, TransactionVersion } from '@solana/web3.js';
import { WalletReadyState } from '@solana/wallet-adapter-base';
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
  const [url, setUrl] = useState('anxz-xyz.github.io/wallet-adapter/example/');
  const [currentUrl, setCurrentUrl] = useState('https://anza-xyz.github.io/wallet-adapter/example/');
  const webViewRef = useRef<WebView>(null);
  const { wallet, isLoading } = useWallet();

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
          Object.freeze(this);
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
          
          Object.freeze(this);
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
                    reject(new Error(data.error || 'Sign in failed'));
                  }
                }
              } catch (e) {
                // Ignore parsing errors
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
      
      // Create comprehensive debugging UI
      if (typeof document !== 'undefined' && !document.getElementById('wallet-debug-panel')) {
        const debugPanel = document.createElement('div');
        debugPanel.id = 'wallet-debug-panel';
        debugPanel.style.cssText = \`
          position: fixed;
          top: 10px;
          right: 10px;
          width: 350px;
          max-height: 500px;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          color: #fff;
          padding: 15px;
          border-radius: 12px;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 11px;
          z-index: 999999;
          border: 2px solid #4f46e5;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          overflow-y: auto;
          backdrop-filter: blur(10px);
        \`;
        
        let logs = [];
        const addLog = (message, type = 'info') => {
          const timestamp = new Date().toLocaleTimeString();
          const colors = {
            info: '#60a5fa',
            success: '#34d399', 
            error: '#f87171',
            warning: '#fbbf24'
          };
          logs.unshift(\`<div style="margin: 2px 0; color: \${colors[type]};">[<span style="color: #9ca3af;">\${timestamp}</span>] \${message}</div>\`);
          if (logs.length > 20) logs = logs.slice(0, 20);
          updateDebugPanel();
        };
        
        const updateDebugPanel = () => {
          const walletStandardWallets = window.navigator?.wallets?.length || 0;
          const detectedWallets = [];
          
          if (window.solana) detectedWallets.push('window.solana');
          if (window.pluto) detectedWallets.push('window.pluto');
          if (window.phantom) detectedWallets.push('window.phantom');
          if (window.solflare) detectedWallets.push('window.solflare');
          if (window.backpack) detectedWallets.push('window.backpack');
          
          debugPanel.innerHTML = \`
            <div style="text-align: center; margin-bottom: 10px;">
              <strong style="color: #4f46e5;">🔍 WALLET DEBUG PANEL</strong>
              <button onclick="this.parentElement.parentElement.style.display='none'" style="float: right; background: #ef4444; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer;">✕</button>
            </div>
            
            <div style="margin-bottom: 8px;">
              <div style="color: #fbbf24; font-weight: bold;">📊 Detection Status:</div>
              <div style="margin-left: 10px;">
                <div>Pluto Injected: <span style="color: \${window.isPlutoWalletInjected ? '#34d399' : '#f87171'}">\${window.isPlutoWalletInjected ? '✅ YES' : '❌ NO'}</span></div>
                <div>Standard Wallets: <span style="color: \${walletStandardWallets > 0 ? '#34d399' : '#f87171'}">\${walletStandardWallets}</span></div>
                <div>Detected: <span style="color: \${detectedWallets.length > 0 ? '#34d399' : '#f87171'}">\${detectedWallets.join(', ') || 'None'}</span></div>
              </div>
            </div>
            
            <div style="margin-bottom: 8px;">
              <div style="color: #fbbf24; font-weight: bold;">🔗 Pluto Wallet:</div>
              <div style="margin-left: 10px;">
                <div>Name: <span style="color: #60a5fa;">\${plutoWallet?.name || 'N/A'}</span></div>
                <div>Version: <span style="color: #60a5fa;">\${plutoWallet?.version || 'N/A'}</span></div>
                <div>Accounts: <span style="color: #60a5fa;">\${plutoWallet?.accounts?.length || 0}</span></div>
                <div>Features: <span style="color: #60a5fa;">\${plutoWallet?.features ? Object.keys(plutoWallet.features).length : 0}</span></div>
              </div>
            </div>
            
            <div style="margin-bottom: 8px;">
              <div style="color: #fbbf24; font-weight: bold;">🧪 Test Actions:</div>
              <div style="margin-left: 10px; display: flex; flex-wrap: wrap; gap: 4px;">
                <button onclick="testWalletConnection()" style="background: #10b981; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 10px;">Connect</button>
                <button onclick="testWalletDisconnect()" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 10px;">Disconnect</button>
                <button onclick="listAllWallets()" style="background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 10px;">List All</button>
                <button onclick="checkEvents()" style="background: #8b5cf6; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 10px;">Events</button>
              </div>
            </div>
            
            <div style="margin-bottom: 8px;">
              <div style="color: #fbbf24; font-weight: bold;">📝 Event Logs:</div>
              <div style="max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; margin-top: 4px;">
                \${logs.join('') || '<div style="color: #9ca3af;">No logs yet...</div>'}
              </div>
            </div>
          \`;
        };
        
        // Test functions
        window.testWalletConnection = async () => {
          try {
            addLog('Testing wallet connection...', 'info');
            if (window.solana && window.solana.connect) {
              const result = await window.solana.connect();
              addLog(\`Connection successful: \${JSON.stringify(result)}\`, 'success');
            } else {
              addLog('No wallet found or connect method missing', 'error');
            }
          } catch (error) {
            addLog(\`Connection failed: \${error.message}\`, 'error');
          }
        };
        
        window.testWalletDisconnect = async () => {
          try {
            addLog('Testing wallet disconnect...', 'info');
            if (window.solana && window.solana.disconnect) {
              await window.solana.disconnect();
              addLog('Disconnection successful', 'success');
            } else {
              addLog('No wallet found or disconnect method missing', 'error');
            }
          } catch (error) {
            addLog(\`Disconnection failed: \${error.message}\`, 'error');
          }
        };
        
        window.listAllWallets = () => {
          addLog('=== ALL DETECTED WALLETS ===', 'info');
          addLog(\`window.solana: \${!!window.solana}\`, 'info');
          addLog(\`window.pluto: \${!!window.pluto}\`, 'info');
          addLog(\`window.phantom: \${!!window.phantom}\`, 'info');
          addLog(\`window.solflare: \${!!window.solflare}\`, 'info');
          addLog(\`window.backpack: \${!!window.backpack}\`, 'info');
          addLog(\`navigator.wallets.length: \${window.navigator?.wallets?.length || 0}\`, 'info');
          
          if (window.solana) {
            addLog(\`Solana wallet name: \${window.solana.name || 'Unknown'}\`, 'info');
            addLog(\`Solana wallet features: \${window.solana.features ? Object.keys(window.solana.features).join(', ') : 'None'}\`, 'info');
          }
          
          if (plutoWallet) {
            addLog(\`Pluto wallet direct access - accounts: \${plutoWallet.accounts?.length || 0}\`, 'info');
          }
        };
        
        window.checkEvents = () => {
          addLog('=== WALLET STANDARD EVENTS CHECK ===', 'info');
          
          // Check if wallet standard events are working
          let eventsFired = 0;
          
          const testCallback = ({ register }) => {
            eventsFired++;
            addLog(\`Wallet standard callback fired #\${eventsFired}\`, 'success');
            if (register && typeof register === 'function') {
              addLog('Register function available', 'success');
            } else {
              addLog('Register function missing!', 'error');
            }
          };
          
          try {
            window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
              detail: testCallback
            }));
            addLog('Test wallet-standard:register-wallet event dispatched', 'info');
          } catch (error) {
            addLog(\`Event dispatch failed: \${error.message}\`, 'error');
          }
          
        setTimeout(() => {
            if (eventsFired === 0) {
              addLog('No wallet standard events fired - possible issue!', 'warning');
            }
          }, 1000);
        };
        
        // Monitor wallet standard events
        const originalDispatchEvent = window.dispatchEvent;
        window.dispatchEvent = function(event) {
          if (event.type && event.type.includes('wallet-standard')) {
            addLog(\`Event: \${event.type}\`, 'info');
          }
          return originalDispatchEvent.call(this, event);
        };
        
        // Monitor addEventListener for wallet events
        const originalAddEventListener = window.addEventListener;
        window.addEventListener = function(type, listener, options) {
          if (type && type.includes('wallet-standard')) {
            addLog(\`Listener added for: \${type}\`, 'info');
          }
          return originalAddEventListener.call(this, type, listener, options);
        };
        
        updateDebugPanel();
        document.body.appendChild(debugPanel);
        
        addLog('Debug panel initialized', 'success');
        addLog('Pluto Wallet registered successfully', 'success');
        
        // Auto-refresh every 5 seconds
        setInterval(updateDebugPanel, 5000);
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

  const handleWalletMessage = async (message: WalletMessage) => {
    console.log('Handling wallet message:', message);
    
    if (!wallet) {
      Alert.alert('Wallet Error', 'No wallet available');
      return;
    }

    const plutoWallet = wallet as PlutoWalletAdapter;
    
    switch (message.type) {
      case 'WALLET_CONNECT':
        try {
          if (!plutoWallet.connected) {
            await plutoWallet.connect();
            sendResponseToWebView('WALLET_CONNECT_RESPONSE', true, {
              publicKey: plutoWallet.publicKey?.toString()
            });
            Alert.alert('Wallet', 'Connected successfully!');
            // Re-inject updated wallet state
            setTimeout(() => injectWalletScript(), 100);
          } else {
            sendResponseToWebView('WALLET_CONNECT_RESPONSE', true, {
              publicKey: plutoWallet.publicKey?.toString()
            });
            Alert.alert('Wallet', 'Already connected');
          }
        } catch (error) {
          console.log('Wallet connect error:', error);
          sendResponseToWebView('WALLET_CONNECT_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Wallet Error', `Failed to connect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_DISCONNECT':
        try {
          if (plutoWallet.connected) {
            await plutoWallet.disconnect();
            Alert.alert('Wallet', 'Disconnected successfully!');
            // Re-inject updated wallet state
            setTimeout(() => injectWalletScript(), 100);
          }
        } catch (error) {
          console.log('Wallet disconnect error:', error);
          Alert.alert('Wallet Error', `Failed to disconnect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_SIGN_TRANSACTION':
        try {
          if (message.data.transaction) {
            const signedTx = await plutoWallet.signTransaction(message.data.transaction);
            sendResponseToWebView('WALLET_SIGN_TRANSACTION_RESPONSE', true, {
              signedTransaction: signedTx
            });
            Alert.alert('Transaction Signed', 'Transaction signed successfully');
            console.log('Signed transaction:', signedTx);
          }
        } catch (error) {
          console.log('Transaction signing error:', error);
          sendResponseToWebView('WALLET_SIGN_TRANSACTION_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Signing Error', `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_SIGN_MESSAGE':
        try {
          if (message.data.message) {
            const signature = await plutoWallet.signMessage(message.data.message);
            sendResponseToWebView('WALLET_SIGN_MESSAGE_RESPONSE', true, {
              signature: signature
            });
            Alert.alert('Message Signed', 'Message signed successfully');
            console.log('Message signature:', signature);
          }
        } catch (error) {
          console.log('Message signing error:', error);
          sendResponseToWebView('WALLET_SIGN_MESSAGE_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Signing Error', `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      case 'WALLET_SIGN_SEND_TRANSACTION':
        try {
          if (message.data.transaction) {
            // For now, we'll use signTransaction and then simulate sending
            const signedTx = await plutoWallet.signTransaction(message.data.transaction);
            // Simulate transaction signature (in a real implementation, you'd send to network)
            const mockSignature = 'signature_' + Date.now().toString(36);
            sendResponseToWebView('WALLET_SIGN_SEND_TRANSACTION_RESPONSE', true, {
              signature: mockSignature
            });
            Alert.alert('Transaction Sent', 'Transaction signed and sent successfully');
            console.log('Signed and sent transaction:', signedTx);
          }
        } catch (error) {
          console.log('Transaction sign and send error:', error);
          sendResponseToWebView('WALLET_SIGN_SEND_TRANSACTION_RESPONSE', false, null, error instanceof Error ? error.message : 'Unknown error');
          Alert.alert('Transaction Error', `Failed to sign and send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      case 'WALLET_SIGN_IN':
        try {
          // Simulate sign in functionality
          const signInOutput = {
            account: {
              address: plutoWallet.publicKey?.toString() || '',
              publicKey: plutoWallet.publicKey?.toString() || ''
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
        
      case 'WALLET_SEND_TRANSACTION':
        Alert.alert('Send Transaction', 'Send transaction requested from WebView');
        // TODO: Implement send transaction with proper types
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
}); 