import React from 'react';
import { Pressable, ScrollView, StyleSheet} from 'react-native';
import { Text } from '../i18n/g_Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, surfaces, radii } from '../theme/tokens';
import { InterfaceIcon } from '../components/InterfaceIcon';

// Navigation and entry screens use the same README-derived palette.
export const navigationColors = {
  background: colors.mist,
  panel: colors.panel,
  text: colors.ink,
  muted: colors.inkSoft,
  primary: colors.teal,
  border: colors.sageLine,
};

type Action = { label: string; onPress: () => void };

export function NavigationPage({
  title,
  description = 'This screen is coming soon.',
  actions = [],
}: {
  title: string;
  description?: string;
  actions?: Action[];
}) {
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.description}>{description}</Text>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SignInGate({ onSignIn }: { onSignIn: () => void }) {
  return (
    <NavigationPage
      title="Sign in to continue"
      description="Sign in to manage your appointments, alerts, and profile."
      actions={[{ label: 'Patient sign in', onPress: onSignIn }]}
    />
  );
}

export const stackOptions = {
  headerShadowVisible: false,
  headerTintColor: navigationColors.primary,
  headerStyle: { backgroundColor: navigationColors.background },
  headerTitleStyle: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  contentStyle: { backgroundColor: navigationColors.background },
};

export const tabOptions = ({ route }: { route: { name: string } }) => ({
  headerShown: false,
  tabBarActiveTintColor: navigationColors.primary,
  tabBarInactiveTintColor: navigationColors.muted,
  tabBarStyle: {
    backgroundColor: navigationColors.panel,
    borderTopColor: colors.sageLine,
    borderTopWidth: 1,
    elevation: 0,
  },
  tabBarLabelStyle: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  tabBarItemStyle: { paddingVertical: 4 },
  tabBarIcon: ({ color }: { color: string }) => (
    <InterfaceIcon name={route.name} color={color} />
  ),
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: navigationColors.background },
  content: {
    ...surfaces.content,
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
    gap: 16,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '600',
    color: colors.tealDark,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: navigationColors.muted,
    marginBottom: 8,
  },
  button: {
    minHeight: 48,
    padding: 16,
    borderRadius: radii.pill,
    backgroundColor: navigationColors.primary,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  buttonLabel: {
    fontFamily: fonts.body,
    color: navigationColors.panel,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
