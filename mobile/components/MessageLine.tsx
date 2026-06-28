import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';

import type { Msg } from '../api';
import { font } from '../theme';

// CRT-text chat: no bubbles. ryaa speaks in glowing phosphor — rendered as
// markdown so **bold**, lists, and code land formatted, with the glow carried
// through the markdown style map. The user's lines are plain glowing text,
// right-aligned. Fades in on mount.
function MessageLine({ item }: { item: Msg }) {
  const isUser = item.role === 'user';
  const o = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(o, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [o]);

  return (
    <Animated.View style={[styles.row, isUser ? styles.userRow : styles.ryaaRow, { opacity: o }]}>
      {isUser ? (
        <Text style={[styles.text, styles.userText]}>{item.content}</Text>
      ) : (
        <>
          <Text style={styles.label}>ryaa</Text>
          <Markdown style={md}>{item.content}</Markdown>
        </>
      )}
    </Animated.View>
  );
}

// Re-render only the line whose content changed (the streaming one); others keep
// their object reference and skip re-parsing markdown.
export default memo(MessageLine);

const GLOW = {
  textShadowColor: 'rgba(214, 232, 255, 0.55)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 10,
} as const;

// base phosphor text applied to every leaf the markdown renderer emits
const PHOSPHOR = {
  color: '#f6f6ef',
  fontFamily: font.body,
  fontSize: 16,
  lineHeight: 23,
  ...GLOW,
} as const;

const md = StyleSheet.create({
  // base text styling goes on `body`: the renderer cascades it into every leaf
  // via inheritedStyles, and (crucially) `strong`/`em`/heading overrides win
  // because the leaf `text` rule is left empty (it'd otherwise clobber them).
  body: PHOSPHOR,
  paragraph: { marginTop: 0, marginBottom: 16 },
  heading1: { fontFamily: font.heading, fontSize: 20, color: '#f6f6ef', marginTop: 16, marginBottom: 6, ...GLOW },
  heading2: { fontFamily: font.heading, fontSize: 18, color: '#f6f6ef', marginTop: 16, marginBottom: 6, ...GLOW },
  heading3: { fontFamily: font.heading, fontSize: 16.5, color: '#f6f6ef', marginTop: 16, marginBottom: 6, ...GLOW },
  strong: { fontFamily: font.bodyBold },
  em: { fontStyle: 'italic' },
  link: { color: '#bfe0ff', textDecorationLine: 'underline' },
  bullet_list: { marginTop: 4, marginBottom: 14 },
  ordered_list: { marginTop: 4, marginBottom: 14 },
  list_item: { marginBottom: 8 },
  bullet_list_icon: { color: '#f6f6ef' },
  ordered_list_icon: { color: '#f6f6ef' },
  code_inline: {
    fontFamily: font.mono,
    color: '#e7e7e0',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    fontFamily: font.mono,
    color: '#e7e7e0',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0,
    borderRadius: 8,
    padding: 10,
    marginVertical: 12,
  },
  code_block: {
    fontFamily: font.mono,
    color: '#e7e7e0',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0,
    borderRadius: 8,
    padding: 10,
    marginVertical: 12,
  },
  blockquote: {
    backgroundColor: 'rgba(255,255,255,0.05)', // override the lib's near-white default
    borderLeftColor: 'rgba(214,232,255,0.4)',
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    marginVertical: 12,
  },
  // lighten the table grid from the lib's default solid black to a phosphor hairline
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(214,232,255,0.28)',
    borderRadius: 6,
    marginVertical: 12,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(214,232,255,0.18)',
  },
  th: { flex: 1, padding: 6 },
  td: { flex: 1, padding: 6 },
});

const styles = StyleSheet.create({
  row: {},
  // markdown is a View tree — it needs a concrete width or it collapses to 1
  // glyph wide and wraps every character. Fixed width; left-aligned content.
  ryaaRow: { alignSelf: 'flex-start', width: '88%' },
  // plain text shrinks to fit, so a max-width cap is enough
  userRow: { alignSelf: 'flex-end', maxWidth: '88%' },
  // the "ryaa" sender tag, echoing the wordmark — a quiet phosphor glow
  label: {
    fontFamily: font.heading,
    fontSize: 12.5,
    letterSpacing: 0.2,
    color: 'rgba(214, 232, 255, 0.6)',
    marginBottom: 3,
    textShadowColor: 'rgba(214, 232, 255, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  text: { fontFamily: font.body, fontSize: 16, lineHeight: 23 },
  // you = opaque white with a phosphor glow; right-aligned, no label
  userText: {
    color: '#eeeee9',
    textAlign: 'right',
    textShadowColor: 'rgba(214, 232, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
});
