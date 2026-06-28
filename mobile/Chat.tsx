import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from './api';
import ChromeButton from './components/ChromeButton';
import CrtBackdrop from './components/CrtBackdrop';
import { Glass, GlassCard } from './components/Glass';
import Wordmark from './components/Wordmark';
import { color, font, radius, screenPad, space } from './theme';

export default function Chat({
  token,
  onSignOut,
}: {
  token: string;
  onSignOut: () => void;
}) {
  const [messages, setMessages] = useState<api.Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<api.ProposeResult | null>(null);
  const insets = useSafeAreaInsets();

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const next: api.Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setPending(null);
    setBusy(true);
    try {
      const res = await api.propose(token, next);
      if (res.summary) {
        setMessages((m) => [...m, { role: 'assistant', content: res.summary! }]);
      }
      if (res.status === 'proposed' && res.event) {
        setPending(res); // show the confirm card
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong. ${e}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEvent() {
    if (!pending?.event) return;
    setBusy(true);
    try {
      const res = await api.confirm(token, pending.action, pending.event, pending.event_id);
      setMessages((m) => [...m, { role: 'assistant', content: res.message }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong. ${e}` }]);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <CrtBackdrop />

      <Glass nav rounded={0} style={styles.header}>
        <Wordmark size={22} treatment="ink" />
        <Pressable onPress={onSignOut} hitSlop={8}>
          <Text style={styles.signout}>sign out</Text>
        </Pressable>
      </Glass>

      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.list}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.assistant]}>
            <Text style={item.role === 'user' ? styles.userText : styles.assistantText}>
              {item.content}
            </Text>
          </View>
        )}
      />

      {pending && (
        <GlassCard style={styles.card}>
          <Text style={styles.cardText}>Add this to your calendar?</Text>
          <Text style={styles.cardNote}>Nothing saves until you say yes.</Text>
          <View style={styles.cardButtons}>
            <ChromeButton label="confirm" compact onPress={confirmEvent} />
            <Pressable onPress={() => setPending(null)} style={styles.cancel} hitSlop={6}>
              <Text style={styles.cancelText}>cancel</Text>
            </Pressable>
          </View>
        </GlassCard>
      )}

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.sm }]}>
        <View style={styles.composerShadow}>
          <Glass nav rounded={32} style={styles.composer}>
            <Glass frosted rounded={22} style={styles.inputWell}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Message ryaa."
                placeholderTextColor={color.inkSoft}
                editable={!busy}
                onSubmitEditing={send}
                returnKeyType="send"
              />
            </Glass>
            {busy ? (
              <ActivityIndicator style={styles.spinner} color={color.ink} />
            ) : (
              <ChromeButton label="send" compact onPress={send} />
            )}
          </Glass>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  // Transparent so CrtBackdrop shows through the chat area (the paper base lives
  // on the KeyboardAvoidingView underneath). An opaque fill here hides the sweep.
  scroll: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: screenPad,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  signout: { fontFamily: font.mono, fontSize: 12.5, color: color.inkSoft },
  list: { padding: space.md, gap: space.sm },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.bubble,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  user: { alignSelf: 'flex-end', backgroundColor: color.ink },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: color.paper2,
    borderWidth: 1,
    borderColor: color.line,
  },
  userText: { color: color.paper, fontFamily: font.body, fontSize: 15.5, lineHeight: 21 },
  assistantText: { color: color.ink, fontFamily: font.body, fontSize: 15.5, lineHeight: 21 },
  card: { margin: space.md },
  cardText: { fontFamily: font.heading, fontSize: 16, color: color.ink },
  cardNote: { fontFamily: font.body, fontSize: 13, color: color.inkSoft, marginTop: 4 },
  cardButtons: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  cancel: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(20,19,15,0.25)',
  },
  cancelText: { fontFamily: font.mono, fontSize: 13, color: color.ink },
  // The composer is ONE floating glass island holding the recessed input + send,
  // mirroring the web app's .composer (a sticky rounded island, not a bare input
  // with a detached button). Shadow lives on an outer wrapper since Glass clips.
  composerWrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  composerShadow: {
    borderRadius: radius.r,
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  // The recessed input well — a frosted-blur inset (see components/Glass.tsx
  // `frosted`), contrasting against the clear liquid-glass capsule around it.
  inputWell: { flex: 1 },
  input: {
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  spinner: { width: 56 },
});
