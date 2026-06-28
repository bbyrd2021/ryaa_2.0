import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
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
import MessageLine from './components/MessageLine';
import ThinkingCaption from './components/ThinkingCaption';
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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [kb, setKb] = useState(0);
  const insets = useSafeAreaInsets();
  const headerH = insets.top + 46; // paddingTop (insets.top+6) + row (~28) + paddingBottom (12)

  // The composer dock is absolute, so KeyboardAvoidingView can't push it — track
  // the keyboard height directly and lift the dock above it.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKb(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKb(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Cancel the in-flight request (the composer's stop button).
  function stop() {
    abortRef.current?.abort();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const next: api.Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setPending(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await api.propose(token, next, controller.signal);
      if (res.summary) {
        setMessages((m) => [...m, { role: 'assistant', content: res.summary! }]);
      }
      if (res.status === 'proposed' && res.event) {
        setPending(res); // show the confirm card
      }
    } catch (e) {
      if (controller.signal.aborted) return; // user stopped it — no error bubble
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong. ${e}` }]);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function confirmEvent() {
    if (!pending?.event) return;
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await api.confirm(
        token,
        pending.action,
        pending.event,
        pending.event_id,
        controller.signal,
      );
      setMessages((m) => [...m, { role: 'assistant', content: res.message }]);
    } catch (e) {
      if (controller.signal.aborted) return; // user stopped it — no error bubble
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong. ${e}` }]);
    } finally {
      abortRef.current = null;
      setPending(null);
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <CrtBackdrop />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.list,
          { paddingTop: headerH + space.md, paddingBottom: (kb > 0 ? kb : insets.bottom) + 96 },
        ]}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => (
          <MessageLine key={i} item={m} scrollY={scrollY} />
        ))}
        {busy && <ThinkingCaption />}
      </Animated.ScrollView>

      {/* Floating header so the list scrolls behind the upper glass too. Rendered
          AFTER the list so it paints on top; onLayout feeds the list's paddingTop. */}
      <View style={styles.headerDock}>
        <Glass nav rounded={0} style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Wordmark size={22} treatment="ink" />
          <Pressable onPress={onSignOut} hitSlop={8}>
            <Text style={styles.signout}>sign out</Text>
          </Pressable>
        </Glass>
      </View>

      {/* Floating dock over the full-height list, so bubbles scroll BEHIND the
          glass. bottom:0 resolves against the KAV's padded box, so it rides above
          the keyboard. */}
      <View style={[styles.bottomDock, { bottom: kb }]}>
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

        <View style={[styles.composerWrap, { paddingBottom: kb > 0 ? space.sm : insets.bottom + space.sm }]}>
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
                <ChromeButton label="stop" compact onPress={stop} />
              ) : (
                <ChromeButton label="send" compact onPress={send} />
              )}
            </Glass>
          </View>
        </View>
      </View>
    </View>
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
    paddingBottom: 12,
    paddingHorizontal: screenPad,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  signout: { fontFamily: font.mono, fontSize: 12.5, color: color.inkSoft },
  list: { padding: space.md, gap: space.md },
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
  // bottomDock floats it (+ confirm card) over the list so bubbles pass behind.
  headerDock: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
});
