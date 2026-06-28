import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

// Quiet CRT tube texture + RGB sweep line, mounted as the FIRST child of Chat so
// it sits BEHIND the chat + glass — the glass refracts it (that's the whole
// point). Paper stays dominant (ryaa-crt-chrome §5: gray idle tube, never black).
// RN has no `mix-blend: screen`, so the sweep is low-alpha additive over paper.

const BAND = 10; // px — feathered height of the sweep line
const PERIOD = 9000; // ms — one slow pass top -> bottom

export default function CrtBackdrop() {
  const { height: H } = useWindowDimensions(); // full device height, so the sweep spans top -> bottom
  const [reduced, setReduced] = useState(false);
  const t = useRef(new Animated.Value(0)).current;

  // Honor the system reduce-motion setting (skill §5: never leave a frozen band).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduced(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: PERIOD,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);

  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAND, H + BAND],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* CRT idle-tube gray (#6f6e66 -> #4a4943) — what the clear glass shows
          through, so it reads as a dark gray screen instead of white paper.
          DARKNESS KNOB: raise these alphas = closer to the solid CRT tube. */}
      <LinearGradient
        colors={['rgba(111,110,102,0.72)', 'rgba(90,89,79,0.80)', 'rgba(74,73,67,0.86)']}
        style={StyleSheet.absoluteFill}
      />

      {/* scanlines — contrast high enough to visibly WARP through the clear glass.
          CONTRAST KNOB: raise this stroke alpha = bolder lines. */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="scan" width={3} height={3} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={3} y2={0} stroke="rgba(20,19,15,0.16)" strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#scan)" />
      </Svg>

      {/* RGB-refraction sweep line — frozen-hidden under reduce-motion */}
      {!reduced && (
        <Animated.View style={[styles.band, { transform: [{ translateY }] }]}>
          <LinearGradient
            colors={[
              'rgba(255,40,40,0)',
              'rgba(255,40,40,0.09)', // red leading edge
              'rgba(255,255,255,0.16)', // bright core
              'rgba(40,255,255,0.09)', // cyan trailing edge
              'rgba(40,255,255,0)',
            ]}
            locations={[0, 0.42, 0.5, 0.58, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, top: 0, height: BAND },
});
