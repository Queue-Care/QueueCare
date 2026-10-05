import { Platform } from 'react-native';

// Visual tokens from opd-high-fidelity-screens .html.
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
  selected: '#F4FAF8',
  doneBg: '#E7EFE9',
  doneText: '#3C6B4E',
  ticketMuted: '#B9D8CF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 22,
  xl: 32,
  xxl: 48,
} as const;
export const radii = {
  sm: 10,
  md: 14,
  lg: 16,
  note: 12,
  icon: 11,
  mark: 26,
  pill: 999,
  circle: 999,
} as const;
export const shadows = {
  selected: { boxShadow: '0 0 0 2px rgba(14,107,92,0.1)' },
  segment: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
} as const;
// System fallbacks are allowed by the README; no remote font dependency.
export const fonts = {
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
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

// Shared presentation primitives; no state, data fetching, or navigation.
export const surfaces = {
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    padding: 16,
  },
  selected: {
    ...shadows.selected,
    borderColor: colors.teal,
    backgroundColor: colors.selected,
  },
  content: {
    width: '100%' as const,
    maxWidth: 560,
    alignSelf: 'center' as const,
  },
};

// Typography mirrors the reference hierarchy with the existing native fallbacks.
export const typography = {
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    color: colors.tealDark,
  },
  heading: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700' as const,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600' as const,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  identifier: {
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500' as const,
  },
};
export const ticketStyles = {
  panel: {
    backgroundColor: colors.tealDark,
    padding: 20,
    borderRadius: radii.lg,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  label: {
    fontFamily: fonts.body,
    color: colors.ticketMuted,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600' as const,
  },
  identifier: { ...typography.identifier, color: colors.panel },
  text: {
    fontFamily: fonts.body,
    color: colors.tealTint,
    fontSize: 14,
    lineHeight: 22,
  },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.16)' },
};
