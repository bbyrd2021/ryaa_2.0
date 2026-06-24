import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { chrome, color, font } from '../theme';

// The `ryaa.` lockup. The period is the ONLY dot allowed on screen (skill §1).
// treatment='ink' -> plain ink text (header). treatment='chrome' -> liquid-chrome
// gradient masked onto "ryaa" with an ink dot (hero). forceSolid falls back to ink
// if MaskedView ever clips on-device.
export default function Wordmark({
  size = 20,
  treatment = 'ink',
  forceSolid = false,
}: {
  size?: number;
  treatment?: 'ink' | 'chrome';
  forceSolid?: boolean;
}) {
  const textStyle = {
    fontFamily: font.display,
    fontSize: size,
    letterSpacing: -0.04 * size,
    color: color.ink,
    lineHeight: size * 1.02,
  };

  if (treatment === 'ink' || forceSolid) {
    return <Text style={textStyle}>ryaa.</Text>;
  }

  return (
    <View style={styles.row}>
      <MaskedView maskElement={<Text style={[textStyle, styles.maskInk]}>ryaa</Text>}>
        <LinearGradient
          colors={chrome.liquid}
          locations={chrome.liquidLocations}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <Text style={[textStyle, styles.invisible]}>ryaa</Text>
        </LinearGradient>
      </MaskedView>
      <Text style={[textStyle, { color: color.ink }]}>.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  maskInk: { color: '#000' }, // mask shape (color irrelevant, must be opaque)
  invisible: { opacity: 0 }, // sizes the gradient to the glyphs
});
