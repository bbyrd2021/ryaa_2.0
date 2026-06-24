import Svg, { Path } from 'react-native-svg';
import { type StyleProp, type ViewStyle } from 'react-native';

import { color } from '../theme';

// The recurring 4-point vector motif. Solid black (ink), never teal. Use sparingly
// (one per screen). Path verbatim from the skill (chrome-and-vector.md).
const PATH =
  'M50 0 C54 38 62 46 100 50 C62 54 54 62 50 100 C46 62 38 54 0 50 C38 46 46 38 50 0 Z';

export default function Sparkle({
  size = 22,
  fill = color.ink,
  opacity = 0.9,
  style,
}: {
  size?: number;
  fill?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={opacity} style={style}>
      <Path d={PATH} fill={fill} />
    </Svg>
  );
}
