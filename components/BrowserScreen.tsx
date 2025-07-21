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

interface BrowserScreenProps {
  onClose: () => void;
}

export const BrowserScreen: React.FC<BrowserScreenProps> = ({ onClose }) => {
  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const webViewRef = useRef<WebView>(null);
  const { wallet, isLoading } = useWallet();

  useEffect(() => {
    if (wallet) {
      wallet.connect();
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
          }}
          onError={(error) => {
            Alert.alert('Error', 'Failed to load the webpage');
          }}
          onHttpError={(error) => {
            Alert.alert('HTTP Error', 'Failed to load the webpage');
          }}
          startInLoadingState={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          injectedJavaScriptBeforeContentLoaded={`
            window.solana = ${wallet ? JSON.stringify(wallet) : '{}'};
            true;
          `}
          injectedJavaScriptObject={{
            solana: wallet
          }}
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