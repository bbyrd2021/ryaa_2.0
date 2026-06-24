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

import * as api from './api';
import ChromeButton from './components/ChromeButton';
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
      <Glass nav rounded={0} style={styles.header}>
        <Wordmark size={22} treatment="ink" />
        <Pressable onPress={onSignOut} hitSlop={8}>
          <Text style={styles.signout}>sign out</Text>
        </Pressable>
      </Glass>

      <FlatList
        style={styles.flex}
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

      <View style={styles.inputRow}>
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
        {busy ? (
          <ActivityIndicator style={styles.spinner} color={color.ink} />
        ) : (
          <ChromeButton label="send" compact onPress={send} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.paper,
  },
  input: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: color.paper2,
  },
  spinner: { width: 56 },
});
