import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { chrome, color, font, radius } from '../theme';

// Brushed-silver primary CTA. Reused for sign-in / Confirm / send so chrome reads
// as ONE system (skill §5). Flat silver only — never gold, never 3D-extruded.
export default function ChromeButton({
  label,
  onPress,
  disabled,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.shadow, pressed && styles.shadowHover, disabled && styles.disabled, style]}
    >
      <LinearGradient
        colors={pressed ? chrome.buttonHover : chrome.buttonColors}
        locations={chrome.buttonLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.grad, compact && styles.gradCompact]}
      >
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.pill,
    shadowColor: color.ink,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  shadowHover: { shadowColor: color.teal, shadowOpacity: 0.3, shadowRadius: 10 }, // the one sanctioned teal
  disabled: { opacity: 0.55 },
  grad: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradCompact: { paddingVertical: 9, paddingHorizontal: 18 },
  label: { fontFamily: font.monoBold, fontSize: 13, color: '#1a1a17', letterSpacing: 0.2 },
});
