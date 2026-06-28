import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';

import type { Msg } from '../api';
import { font } from '../theme';
import { SWEEP_BAND, sweepT } from './crtSweep';

// px window around the sweep band over which a line splits as it passes through
const PEAK = 34;
const SPLIT = 2; // max red/cyan offset (±px) — subtle

// CRT-text chat: no bubbles. ryaa speaks in glowing phosphor; the user's lines
// are plain light, right-aligned. As the shared sweep band crosses a line, the
// text splits red-left / cyan-right (chromatic aberration) — the landing page's
// RGB-refraction effect — synced to the visible band via the line's on-screen Y.
export default function MessageLine({
  item,
  scrollY,
}: {
  item: Msg;
  scrollY: Animated.Value;
}) {
  const isUser = item.role === 'user';
  const { height: H } = useWindowDimensions();
  const o = useRef(new Animated.Value(0)).current;
  const [layoutY, setLayoutY] = useState(100000); // off-screen until measured

  useEffect(() => {
    Animated.timing(o, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [o]);

  // band's screen Y vs this line's screen Y (layout offset - scroll); ~0 = passing.
  const sweepY = sweepT.interpolate({
    inputRange: [0, 1],
    outputRange: [-SWEEP_BAND, H + SWEEP_BAND],
  });
  const diff = Animated.add(Animated.subtract(sweepY, layoutY), scrollY);
  const distort = diff.interpolate({
    inputRange: [-PEAK, 0, PEAK],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  // ghosts sit exactly under the main text at rest (invisible), then spread.
  const redX = distort.interpolate({ inputRange: [0, 1], outputRange: [0, -SPLIT] });
  const cyanX = distort.interpolate({ inputRange: [0, 1], outputRange: [0, SPLIT] });
  const align = isUser ? 'right' : 'left';

  return (
    <Animated.View
      onLayout={(e: LayoutChangeEvent) => setLayoutY(e.nativeEvent.layout.y)}
      style={[styles.row, isUser ? styles.userRow : styles.ryaaRow, { opacity: o }]}
    >
      {!isUser && <Text style={styles.label}>ryaa</Text>}
      <Animated.View style={styles.textWrap}>
        <Animated.Text
          style={[styles.text, styles.ghost, { color: '#ff1a1a', textAlign: align, transform: [{ translateX: redX }] }]}
        >
          {item.content}
        </Animated.Text>
        <Animated.Text
          style={[styles.text, styles.ghost, { color: '#1affff', textAlign: align, transform: [{ translateX: cyanX }] }]}
        >
          {item.content}
        </Animated.Text>
        <Text style={[styles.text, isUser ? styles.userText : styles.ryaaText]}>{item.content}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { maxWidth: '88%' },
  ryaaRow: { alignSelf: 'flex-start' },
  userRow: { alignSelf: 'flex-end' },
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
  textWrap: { position: 'relative' },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0 },
  text: { fontFamily: font.body, fontSize: 16, lineHeight: 23 },
  // ryaa = glowing phosphor text lit on the tube
  ryaaText: {
    color: '#f6f6ef',
    textShadowColor: 'rgba(214, 232, 255, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  // you = opaque white (must be opaque, or the cyan ghost bleeds through) with a
  // phosphor glow too; right-aligned + no "ryaa" label distinguishes it
  userText: {
    color: '#eeeee9',
    textAlign: 'right',
    textShadowColor: 'rgba(214, 232, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
});
