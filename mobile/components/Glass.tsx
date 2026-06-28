import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius } from '../theme';

// Real iOS 26 liquid glass when the device supports it; frosted blur otherwise.
// Decided once at module load — it can't change at runtime.
const LIQUID = isLiquidGlassAvailable();

// Frosted-glass / liquid-glass surface (nav header, confirm card, composer).
//
// - Default: liquid glass on iOS 26+, blur fallback everywhere else.
// - `frosted`: FORCE the blur path even on iOS 26 — used for the recessed input
//   well, whose frost is meant to contrast against the clear glass capsule
//   around it. `frosted` also flips the lighting (inset shadow, not highlight).
//
// On the liquid path we paint NO opaque underlay and NO top highlight: both kill
// the refraction. The warm-paper tint rides on GlassView's tintColor instead.
export function Glass({
  children,
  style,
  intensity,
  rounded = radius.r,
  nav = false,
  frosted = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  rounded?: number;
  nav?: boolean;
  frosted?: boolean;
}) {
  const surface: StyleProp<ViewStyle> = [
    { borderRadius: rounded, overflow: 'hidden', borderWidth: 1, borderColor: color.glassBorder },
    style,
  ];

  if (LIQUID && !frosted) {
    // Real iOS 26 Liquid Glass: NO tint, max-transparent `clear` so the backdrop
    // refracts/warps through it, finished with a bright glossy specular rim (the
    // signature edge) instead of the dark hairline.
    return (
      <GlassView
        glassEffectStyle="clear"
        isInteractive
        style={[
          { borderRadius: rounded, overflow: 'hidden', borderWidth: 1.5, borderColor: color.glassRim },
          style,
        ]}
      >
        {children}
      </GlassView>
    );
  }

  // Blur fallback — Android, pre-26 iOS, and the forced `frosted` inset. Always
  // paints the rgba fill + border under the blur so it still reads on weak blur.
  return (
    <BlurView intensity={intensity ?? (frosted ? 12 : nav ? 36 : 28)} tint="light" style={surface}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: frosted ? color.frostWell : nav ? color.glassNav : color.glassPanel },
        ]}
      />
      {frosted ? (
        <>
          {/* recessed well: shadow on top, highlight on bottom (lit inverse of a raised surface) */}
          <View pointerEvents="none" style={styles.insetShadow} />
          <View pointerEvents="none" style={styles.insetHighlight} />
        </>
      ) : (
        <View pointerEvents="none" style={styles.topHighlight} />
      )}
      {children}
    </BlurView>
  );
}

// Glass panel with an OUTER shadow wrapper (shadow can't sit on overflow:hidden).
export function GlassCard({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={styles.cardShadow}>
      <Glass rounded={radius.r} style={[styles.cardInner, style]}>
        {children}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: color.topHighlight,
  },
  insetShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  insetHighlight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  cardShadow: {
    borderRadius: radius.r,
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardInner: { padding: 14 },
});
