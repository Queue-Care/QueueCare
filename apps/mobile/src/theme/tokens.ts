import { Platform } from 'react-native';

// Palette from README section 12. Shared components can build on these tokens.
export const colors = {
  mist: '#F5F8F7',
  panel: '#FFFFFF',
  ink: '#17302A',
  inkSoft: '#4A625C',
  teal: '#0E6B5C',
  tealDark: '#0A4F45',
  tealTint: '#E4F0EC',
  coral: '#E2624C',
  coralStrong: '#A53727',
  coralTint: '#FBE7E2',
  amber: '#C68A1F',
  amberTint: '#FBF0DA',
  sage: '#CFDDD7',
  sageLine: '#DFE9E5',
  controlBorder: '#6C827A',
  canvas: '#E8EDEB',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
export const radii = { sm: 12, md: 20, lg: 28 } as const;
// System fallbacks are allowed by the README; no remote font dependency.
export const fonts = {
  display: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'serif',
  }),
  body: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: undefined,
  }),
};
