import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';

import { BACKEND } from './api';
import Chat from './Chat';

const TOKEN_KEY = 'ryaa_session_token';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On launch, load a previously-saved session token so you stay signed in.
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((saved) => {
      setToken(saved);
      setLoading(false);
    });
  }, []);

  async function signIn() {
    // Where Google should send us back to — a deep link into THIS app.
    // Expo Go -> exp://192.168.x.x:8081/--/auth ; a real build -> ryaa://auth
    const returnUrl = Linking.createURL('auth');
    const startUrl = `${BACKEND}/auth/google/start?return_url=${encodeURIComponent(returnUrl)}`;

    // Opens the system browser; resolves once it redirects back to returnUrl.
    const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
    if (result.type === 'success') {
      const sessionToken = Linking.parse(result.url).queryParams?.session_token;
      if (typeof sessionToken === 'string') {
        await SecureStore.setItemAsync(TOKEN_KEY, sessionToken);
        setToken(sessionToken);
      }
    }
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // Signed in -> the chat; signed out -> the sign-in button.
  if (token) {
    return <Chat token={token} onSignOut={signOut} />;
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>RYAA</Text>
      <Button title="Sign in with Google" onPress={signIn} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#fff',
  },
  title: { fontSize: 34, fontWeight: '700' },
});
