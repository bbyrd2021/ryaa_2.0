import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { color, font } from '../theme';
import Sparkle from './Sparkle';

// Claude-style "working" caption shown under the conversation while ryaa is
// processing a response: a white line that gently pulses and rotates verbs,
// with a spinning Y2K star beside it.
const VERBS = ['thinking', 'reading your calendar', 'working it out'];
const ROTATE_MS = 2200;

export default function ThinkingCaption() {
  const [i, setI] = useState(0);
  const pulse = useRef(new Animated.Value(0.5)).current;
  const spin = useRef(new Animated.Value(0)).current;

  // gentle opacity breathe on the text
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // continuous spin on the star
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  // rotate the working verb
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % VERBS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.row}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Sparkle size={14} fill={color.paper} opacity={0.95} />
      </Animated.View>
      <Animated.Text style={[styles.text, { opacity: pulse }]}>
        ryaa is {VERBS[i]}…
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 4,
  },
  text: { fontFamily: font.body, fontSize: 13.5, color: color.paper },
});
