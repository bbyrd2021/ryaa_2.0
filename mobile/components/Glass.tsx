import { BlurView } from 'expo-blur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius } from '../theme';

// Frosted-glass surface (nav header, confirm card). Always paints the rgba fill
// + border + top highlight UNDER the blur, so it still reads on Android / weak blur.
export function Glass({
  children,
  style,
  intensity,
  rounded = radius.r,
  nav = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  rounded?: number;
  nav?: boolean;
}) {
  return (
    <BlurView
      intensity={intensity ?? (nav ? 36 : 28)}
      tint="light"
      style={[
        { borderRadius: rounded, overflow: 'hidden', borderWidth: 1, borderColor: color.glassBorder },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: nav ? color.glassNav : color.glassPanel }]}
      />
      <View pointerEvents="none" style={styles.topHighlight} />
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
