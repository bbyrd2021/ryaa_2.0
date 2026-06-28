import { Animated, Easing } from 'react-native';

// One shared driver for the CRT sweep, so the backdrop band and the per-line
// text distortion stay in exact lockstep (same value, native driver). Lives at
// module scope because the sweep is a single global animation.
export const SWEEP_PERIOD = 9000; // ms — one slow pass top -> bottom
export const SWEEP_BAND = 10; // px — band thickness

export const sweepT = new Animated.Value(0); // 0..1, looped

let started = false;
export function startSweep() {
  if (started) return;
  started = true;
  Animated.loop(
    Animated.timing(sweepT, {
      toValue: 1,
      duration: SWEEP_PERIOD,
      easing: Easing.linear,
      useNativeDriver: true,
    }),
  ).start();
}
