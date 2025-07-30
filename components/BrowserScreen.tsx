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
  type: 'WALLET_CONNECT' | 'WALLET_DISCONNECT' | 'WALLET_SIGN_TRANSACTION' | 'WALLET_SIGN_MESSAGE' | 'WALLET_SEND_TRANSACTION';
  data: {
    transaction?: Transaction | VersionedTransaction;
    transactions?: (Transaction | VersionedTransaction)[];
    message?: Uint8Array;
  };
}

// Type guard to validate wallet messages
function isWalletMessage(obj: Record<string, any>): obj is WalletMessage {
  return (
    typeof obj.type === 'string' &&
    ['WALLET_CONNECT', 'WALLET_DISCONNECT', 'WALLET_SIGN_TRANSACTION', 'WALLET_SIGN_MESSAGE', 'WALLET_SEND_TRANSACTION'].includes(obj.type) &&
    typeof obj.data === 'object' &&
    obj.data !== null
  );
}

interface BrowserScreenProps {
  onClose: () => void;
}

export const BrowserScreen: React.FC<BrowserScreenProps> = ({ onClose }) => {
  const [url, setUrl] = useState('jup.ag');
  const [currentUrl, setCurrentUrl] = useState('https://jup.ag');
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
      // Create complete PlutoWalletAdapter-compatible wallet object
      window.solanaWallet = {
        // Static properties matching PlutoWalletAdapter
        name: "${walletData.name}",
        url: "${walletData.url}",
        icon: "${walletData.icon}",
        supportedTransactionVersions: new Set(${JSON.stringify(Array.from(walletData.supportedTransactionVersions))}),
        
        // Dynamic properties
        publicKey: ${walletData.publicKey ? `"${walletData.publicKey}"` : 'null'},
        connecting: ${walletData.connecting},
        connected: ${walletData.connected},
        readyState: "${walletData.readyState}",
        
        // Methods that communicate back to React Native
        autoConnect: function() {
          console.log('Auto-connecting wallet...');
          return this.connect();
        },
        
        connect: function() {
          console.log('Requesting wallet connection...');
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_CONNECT',
            data: {}
          }));
          return Promise.resolve();
        },
        
        disconnect: function() {
          console.log('Requesting wallet disconnection...');
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_DISCONNECT', 
            data: {}
          }));
          return Promise.resolve();
        },
        
        signTransaction: function(transaction) {
          console.log('Requesting transaction signature...');
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_SIGN_TRANSACTION',
            data: { transaction: transaction }
          }));
          return Promise.resolve(transaction);
        },
        
        signAllTransactions: function(transactions) {
          console.log('Requesting multiple transaction signatures...');
          const promises = transactions.map(tx => this.signTransaction(tx));
          return Promise.all(promises);
        },
        
        signMessage: function(message) {
          console.log('Requesting message signature...');
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'WALLET_SIGN_MESSAGE',
            data: { message: message }
          }));
          return Promise.resolve(message);
        },
        
        // Additional Solana wallet adapter properties
        isPluto: true,
        version: "1.0.0"
      };
      
      // Create standard Solana wallet interfaces for maximum dApp compatibility
      window.solana = window.solanaWallet;
      window.pluto = {
        solana: window.solanaWallet,
        isPluto: true
      };
      window.navigator.wallets.push(window.solana);

      window.dispatchEvent(new Event('wallet-standard:register-wallet', {
            bubbles: false,
            cancelable: false,
            composed: false,
        }));

      window.addEventListener('wallet-standard:app-ready', (event) => {
        console.log('Wallet standard app ready');
        event.detail(window.solanaWallet);
      });
      
      // Set detection flag
      window.isPlutoWalletInjected = true;
      
      // Create a simple test UI for wallet interaction
      if (typeof document !== 'undefined' && !document.getElementById('rn-wallet-test')) {
        const testDiv = document.createElement('div');
        testDiv.id = 'rn-wallet-test';
        testDiv.style.cssText = \`
          position: fixed;
          top: 10px;
          right: 10px;
          background: #000;
          color: #fff;
          padding: 10px;
          border-radius: 8px;
          font-family: monospace;
          font-size: 12px;
          z-index: 9999;
          max-width: 300px;
          border: 2px solid #333;
        \`;
        
        testDiv.innerHTML = \`
          <div><strong>🔗 \${window.solanaWallet.name}</strong></div>
          <div>PublicKey: \${window.solanaWallet.publicKey ? window.solanaWallet.publicKey.slice(0, 8) + '...' : 'None'}</div>
          <div>Status: \${window.solanaWallet.connected ? '✅ Connected' : '❌ Disconnected'}</div>
          <div>Ready: \${window.solanaWallet.readyState}</div>
          <div>Connecting: \${window.solanaWallet.connecting ? 'Yes' : 'No'}</div>
          <button onclick="window.solanaWallet.connect()" style="margin: 2px; padding: 4px 8px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Connect</button>
          <button onclick="window.solanaWallet.disconnect()" style="margin: 2px; padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Disconnect</button>
          <button onclick="console.log('Wallet:', window.solanaWallet); console.log('Solana:', window.solana)" style="margin: 2px; padding: 4px 8px; background: #2196F3; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Log</button>
          <button onclick="window.solanaWallet.autoConnect()" style="margin: 2px; padding: 4px 8px; background: #FF9800; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Auto</button>
        \`;
        
        document.body.appendChild(testDiv);
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
          if (testDiv && testDiv.parentNode) {
            testDiv.style.opacity = '0.3';
          }
        }, 10000);
      }
      
      console.log('✅ Wallet injected successfully:', window.solanaWallet);
      window.ReactNativeWebView?.postMessage('Wallet injected: ' + JSON.stringify({
        name: "${walletData.name}",
        publicKey: ${walletData.publicKey ? `"${walletData.publicKey}"` : 'null'},
        connected: ${walletData.connected},
        readyState: "${walletData.readyState}"
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
            Alert.alert('Wallet', 'Connected successfully!');
            // Re-inject updated wallet state
            setTimeout(() => injectWalletScript(), 100);
          } else {
            Alert.alert('Wallet', 'Already connected');
          }
        } catch (error) {
          console.error('Wallet connect error:', error);
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
          console.error('Wallet disconnect error:', error);
          Alert.alert('Wallet Error', `Failed to disconnect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_SIGN_TRANSACTION':
        try {
          if (message.data.transaction) {
            const signedTx = await plutoWallet.signTransaction(message.data.transaction);
            Alert.alert('Transaction Signed', 'Transaction signed successfully');
            console.log('Signed transaction:', signedTx);
          }
        } catch (error) {
          console.error('Transaction signing error:', error);
          Alert.alert('Signing Error', `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
        
      case 'WALLET_SIGN_MESSAGE':
        try {
          if (message.data.message) {
            const signature = await plutoWallet.signMessage(message.data.message);
            Alert.alert('Message Signed', 'Message signed successfully');
            console.log('Message signature:', signature);
          }
        } catch (error) {
          console.error('Message signing error:', error);
          Alert.alert('Signing Error', `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            
            // Create wallet detection flag
            window.isPlutoWalletInjected = false;
            
            window.ReactNativeWebView?.postMessage('Before content: Wallet placeholders prepared');
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