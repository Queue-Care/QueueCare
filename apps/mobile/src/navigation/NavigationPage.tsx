import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Local scaffold styling; S-10 will supply the shared design system.
export const navigationColors = {
  background: '#F5F8F7',
  panel: '#FFFFFF',
  text: '#17302A',
  muted: '#4A625C',
  primary: '#0E6B5C',
  border: '#DFE9E5',
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
        {actions.map(action => (
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
  headerTintColor: navigationColors.primary,
  headerStyle: { backgroundColor: navigationColors.panel },
  contentStyle: { backgroundColor: navigationColors.background },
};

export const tabOptions = {
  headerShown: false,
  tabBarActiveTintColor: navigationColors.primary,
  tabBarInactiveTintColor: navigationColors.muted,
  tabBarStyle: { backgroundColor: navigationColors.panel },
  tabBarIcon: () => null,
  tabBarIconStyle: { display: 'none' as const },
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: navigationColors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 30, fontWeight: '700', color: navigationColors.text },
  description: {
    fontSize: 17,
    lineHeight: 26,
    color: navigationColors.muted,
    marginBottom: 8,
  },
  button: {
    minHeight: 48,
    padding: 16,
    borderRadius: 12,
    backgroundColor: navigationColors.primary,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  buttonLabel: {
    color: navigationColors.panel,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
