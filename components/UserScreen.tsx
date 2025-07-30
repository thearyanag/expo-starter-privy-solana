import React, { useState, useCallback } from "react";
import { Text, TextInput, View, Button, ScrollView } from "react-native";

import {
  usePrivy,
  useEmbeddedSolanaWallet,
  getUserEmbeddedSolanaWallet,
  PrivyEmbeddedSolanaWalletProvider,
} from "@privy-io/expo";
import { PrivyUser } from "@privy-io/public-api";
import { BrowserScreen } from "./BrowserScreen";
import { WalletProvider } from "./WalletContext";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";


const toMainIdentifier = (x: PrivyUser["linked_accounts"][number]) => {
  if (x.type === "phone") {
    return x.phoneNumber;
  }
  if (x.type === "email" || x.type === "wallet") {
    return x.address;
  }

  if (x.type === "twitter_oauth" || x.type === "tiktok_oauth") {
    return x.username;
  }

  if (x.type === "custom_auth") {
    return x.custom_user_id;
  }

  return x.type;
};

export const UserScreen = () => {
  const [signedMessages, setSignedMessages] = useState<string[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);

  const { logout, user } = usePrivy() 
  const { wallets, create } = useEmbeddedSolanaWallet();
  const account = getUserEmbeddedSolanaWallet(user);

  const signMessage = useCallback(
    async (provider: PrivyEmbeddedSolanaWalletProvider) => {
      try {
        const message = await provider.request({
          method: 'signMessage',
          params: {
            message: `0x0${Date.now()}`,
          },
        });
        if (message) {
          setSignedMessages((prev) => prev.concat(message.signature));
        }
      } catch (e) {
        console.error(e);
      }
    },
    [account?.address]
  );

  const getlamportstx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: new PublicKey(wallets![0].address),
    toPubkey: new PublicKey(wallets![0].address),
    lamports: 1000000000,
  }))

  const signTransaction = useCallback(
    async (provider: PrivyEmbeddedSolanaWalletProvider) => {
      try {

        const tx = getlamportstx
        const connection = new Connection("https://api.devnet.solana.com")
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        tx.feePayer = new PublicKey(wallets![0].address)

        const transaction = await provider.request({
          method: 'signTransaction',
          params: {
            transaction: tx
          },
        });
        if (transaction) {
          setSignedMessages((prev) => prev.concat(Buffer.from(transaction.signedTransaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          })).toString('base64')));
        }
      } catch (e) {
        console.error(e);
      }
    },
    [account?.address]
  );

  if (!user) {
    return null;
  }

  // Show browser screen if browser is open
  if (showBrowser) {
    return (
      <WalletProvider>
        <BrowserScreen onClose={() => setShowBrowser(false)} />
      </WalletProvider>
    );
  }

  return (
    <View>

      <ScrollView style={{ borderColor: "rgba(0,0,0,0.1)", borderWidth: 1 }}>
        <View
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <View>
            <Text style={{ fontWeight: "bold" }}>User ID</Text>
            <Text>{user.id}</Text>
          </View>

          <View>
            <Text style={{ fontWeight: "bold" }}>Linked accounts</Text>
            {user?.linked_accounts.length ? (
              <View style={{ display: "flex", flexDirection: "column" }}>
                {user?.linked_accounts?.map((m, index) => (
                  <Text
                    key={`linked-account-${m.type}-${m.verified_at}-${index}`}
                    style={{
                      color: "rgba(0,0,0,0.5)",
                      fontSize: 12,
                      fontStyle: "italic",
                    }}
                  >
                    {m.type}: {toMainIdentifier(m)}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          <View>
            {account?.address && (
              <>
                <Text style={{ fontWeight: "bold" }}>Embedded Wallet</Text>
                <Text>{account?.address}</Text>
              </>
            )}

            <Button title="arya Wallet" onPress={() => create?.()} />


          </View>

          <View style={{ display: "flex", flexDirection: "column" }}>
            <Button
              title="Sign Message"
              onPress={async () => signMessage(await wallets![0].getProvider()!)}
            />

<Button
              title="Sign Transaction"
              onPress={async () => signTransaction(await wallets![0].getProvider()!)}
            />

            <Text>Messages signed:</Text>
            {signedMessages.map((m) => (
              <React.Fragment key={m}>
                <Text
                  style={{
                    color: "rgba(0,0,0,0.5)",
                    fontSize: 12,
                    fontStyle: "italic",
                  }}
                >
                  {m}
                </Text>
                <View
                  style={{
                    marginVertical: 5,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(0,0,0,0.2)",
                  }}
                />
              </React.Fragment>
            ))}
          </View>
          <Button title="Open Browser" onPress={() => setShowBrowser(true)} />
          <Button title="Logout" onPress={logout} />
        </View>
      </ScrollView>
    </View>
  );
};
