import {
  FamiljenGrotesk_600SemiBold,
  FamiljenGrotesk_700Bold,
} from '@expo-google-fonts/familjen-grotesk';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
} from '@expo-google-fonts/hanken-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BACKEND } from './api';
import Chat from './Chat';
import ChromeButton from './components/ChromeButton';
import Sparkle from './components/Sparkle';
import Wordmark from './components/Wordmark';
import { color, font, screenPad, space } from './theme';

const TOKEN_KEY = 'ryaa_session_token';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    FamiljenGrotesk_700Bold,
    FamiljenGrotesk_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

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

  if (loading || !fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.ink} />
      </View>
    );
  }

  // Signed in -> the chat; signed out -> the sign-in screen.
  if (token) {
    return <Chat token={token} onSignOut={signOut} />;
  }

  return (
    <View style={styles.center}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <Sparkle size={24} opacity={0.85} style={styles.sparkle} />
        <Wordmark size={72} treatment="chrome" />
      </View>
      <Text style={styles.tagline}>asks before it acts.</Text>
      <ChromeButton label="sign in with google" onPress={signIn} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    backgroundColor: color.paper,
    paddingHorizontal: screenPad,
  },
  hero: { alignSelf: 'center' },
  sparkle: { position: 'absolute', top: -16, left: -10 },
  tagline: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, marginTop: -2 },
  cta: { marginTop: space.lg },
});
