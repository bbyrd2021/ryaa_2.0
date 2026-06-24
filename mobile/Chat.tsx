import { useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as api from './api';

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
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${e}` }]);
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
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${e}` }]);
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
      <View style={styles.header}>
        <Text style={styles.title}>RYAA</Text>
        <Button title="Sign out" onPress={onSignOut} />
      </View>

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
        <View style={styles.card}>
          <Text style={styles.cardText}>Add this to your calendar?</Text>
          <View style={styles.cardButtons}>
            <Button title="Confirm" onPress={confirmEvent} />
            <Button title="Cancel" color="#888" onPress={() => setPending(null)} />
          </View>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message RYAA…"
          editable={!busy}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        {busy ? <ActivityIndicator style={styles.spinner} /> : <Button title="Send" onPress={send} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: { fontSize: 22, fontWeight: '700' },
  list: { padding: 12, gap: 8 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  user: { alignSelf: 'flex-end', backgroundColor: '#0a84ff' },
  assistant: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  userText: { color: '#fff' },
  assistantText: { color: '#111' },
  card: { margin: 12, padding: 14, borderRadius: 14, backgroundColor: '#f3f7ff', gap: 10 },
  cardText: { fontSize: 15 },
  cardButtons: { flexDirection: 'row', justifyContent: 'space-around' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 16,
  },
  spinner: { width: 64 },
});
