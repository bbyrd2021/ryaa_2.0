// RYAA design tokens — verbatim from the ryaa-crt-chrome skill (§2).
// Single source of truth for the app's visual identity.

export const color = {
  paper: '#efede6', // --paper
  paper2: '#e6e3db', // --paper-2
  ink: '#14130f', // --ink
  inkSoft: '#6b695f', // --ink-soft
  line: 'rgba(20, 19, 15, 0.14)', // --line
  teal: '#0b7a6b', // --teal  ACCENT ONLY (button-press glow) — never a theme

  // glass (from references/glass.md baseline)
  glassPanel: 'rgba(255, 255, 255, 0.26)',
  glassNav: 'rgba(239, 237, 230, 0.22)', // paper-tinted glass fill — OPACITY KNOB (lower = more see-through / grayer)
  glassBorder: 'rgba(20, 19, 15, 0.12)',
  topHighlight: 'rgba(255, 255, 255, 0.55)',
  glassRim: 'rgba(255, 255, 255, 0.5)', // bright glossy specular edge on liquid glass
  frostWell: 'rgba(255, 255, 255, 0.16)', // recessed input well — translucent so the backdrop warps through
} as const;

export const radius = { r: 18, bubble: 16, pill: 999 } as const;
export const maxw = 720; // --maxw
export const screenPad = 22; // --pad on mobile
export const space = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

// Font-family keys MUST match the names passed to useFonts() in App.tsx.
export const font = {
  display: 'FamiljenGrotesk_700Bold', // wordmark, section titles
  heading: 'FamiljenGrotesk_600SemiBold',
  body: 'HankenGrotesk_400Regular', // body only
  bodyMed: 'HankenGrotesk_500Medium',
  mono: 'SpaceMono_400Regular', // genuine tech bits (labels)
  monoBold: 'SpaceMono_700Bold', // button labels
} as const;

// Brushed-chrome + liquid-chrome gradient stops (chrome-and-vector.md / footer).
export const chrome = {
  // brushed silver button (vertical: start {0,0} -> end {0,1})
  buttonColors: ['#ffffff', '#e2e1dc', '#b6b5af', '#d6d4ce', '#f1efe9'],
  buttonLocations: [0, 0.38, 0.52, 0.7, 1],
  buttonHover: ['#ffffff', '#ebeae5', '#c4c3bd', '#e0ded8', '#ffffff'],
  // liquid chrome for the hero wordmark fill
  liquid: ['#b8b6ad', '#f2f0e9', '#8a8980', '#e4e2d9', '#76756d', '#d0cec5', '#5a594f'],
  liquidLocations: [0, 0.18, 0.34, 0.5, 0.64, 0.8, 1],
} as const;
