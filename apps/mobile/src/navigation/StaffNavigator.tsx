import React, { useState } from 'react';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { NavigationPage, stackOptions, tabOptions } from './NavigationPage';
import type {
  DashboardStackParams,
  PriorityStackParams,
  SessionsStackParams,
  StaffSummary,
  StaffTabParams,
} from './types';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PriorityRequestDetailsScreen } from '../screens/PriorityRequestDetailsScreen';
import { PriorityRequestsScreen } from '../screens/PriorityRequestsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReceptionDeskScreen } from '../screens/ReceptionDeskScreen';
import { colors } from '../theme/colors';

const Tabs = createBottomTabNavigator<StaffTabParams>();
const Dashboard = createNativeStackNavigator<DashboardStackParams>();
const Sessions = createNativeStackNavigator<SessionsStackParams>();
const Priority = createNativeStackNavigator<PriorityStackParams>();

type Access = {
  accessToken?: string;
  staff?: StaffSummary;
  onSessionExpired?: () => void;
  onSignOut?: () => void;
};
type Pending = { onPendingCount: (count: number) => void };

function DashboardNavigator({
  accessToken,
  staff,
  onSessionExpired,
  onPendingCount,
}: Access & Pending) {
  return (
    <Dashboard.Navigator
      screenOptions={{ ...stackOptions, headerShown: false }}
    >
      <Dashboard.Screen name="ReceptionDashboard">
        {({
          navigation,
        }: NativeStackScreenProps<
          DashboardStackParams,
          'ReceptionDashboard'
        >) => {
          const tabs =
            navigation.getParent<BottomTabNavigationProp<StaffTabParams>>();
          return (
            <ReceptionDeskScreen
              accessToken={accessToken}
              staff={staff}
              onSessionExpired={onSessionExpired}
              onPendingCount={onPendingCount}
              onOpenSessions={() => tabs.navigate('Sessions')}
              onOpenPriority={() => tabs.navigate('Priority')}
              onOpenProfile={() => tabs.navigate('Profile')}
              onOpenNotifications={() =>
                navigation.navigate('StaffNotifications')
              }
            />
          );
        }}
      </Dashboard.Screen>
      <Dashboard.Screen name="StaffNotifications">
        {({ navigation }) => (
          <NotificationsScreen
            accessToken={accessToken}
            onSessionExpired={onSessionExpired}
            onBack={() => navigation.goBack()}
          />
        )}
      </Dashboard.Screen>
    </Dashboard.Navigator>
  );
}
function SessionsList({
  navigation,
}: NativeStackScreenProps<SessionsStackParams, 'SessionsList'>) {
  return (
    <NavigationPage
      title="OPD sessions"
      actions={[
        {
          label: 'Add session',
          onPress: () => navigation.navigate('AddEditSession'),
        },
      ]}
    />
  );
}
function SessionsNavigator() {
  return (
    <Sessions.Navigator screenOptions={stackOptions}>
      <Sessions.Screen
        name="SessionsList"
        component={SessionsList}
        options={{ title: 'OPD sessions' }}
      />
      <Sessions.Screen
        name="AddEditSession"
        options={({ route }) => ({
          title: route.params?.sessionId ? 'Edit session' : 'Add session',
        })}
      >
        {({ route }) => (
          <NavigationPage
            title={route.params?.sessionId ? 'Edit session' : 'Add session'}
          />
        )}
      </Sessions.Screen>
    </Sessions.Navigator>
  );
}
function PriorityNavigator({
  accessToken,
  onSessionExpired,
  onPendingCount,
}: Access & Pending) {
  return (
    <Priority.Navigator screenOptions={{ ...stackOptions, headerShown: false }}>
      <Priority.Screen name="PriorityRequests">
        {({ navigation }) => (
          <PriorityRequestsScreen
            navigation={navigation}
            accessToken={accessToken}
            onSessionExpired={onSessionExpired}
            onPendingCount={onPendingCount}
          />
        )}
      </Priority.Screen>
      <Priority.Screen name="PriorityRequestDetails">
        {({ navigation, route }) => (
          <PriorityRequestDetailsScreen
            navigation={navigation}
            route={route}
            accessToken={accessToken}
            onSessionExpired={onSessionExpired}
          />
        )}
      </Priority.Screen>
    </Priority.Navigator>
  );
}
export function StaffNavigator(access: Access) {
  // Shown on the Priority tab, as in the prototype's tab bar.
  const [pendingCount, setPendingCount] = useState(0);
  return (
    <Tabs.Navigator screenOptions={tabOptions}>
      <Tabs.Screen name="Dashboard">
        {() => (
          <DashboardNavigator {...access} onPendingCount={setPendingCount} />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Sessions" component={SessionsNavigator} />
      <Tabs.Screen
        name="Priority"
        options={{
          tabBarBadge: pendingCount || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral },
          tabBarAccessibilityLabel: pendingCount
            ? `Priority, ${pendingCount} pending`
            : 'Priority',
        }}
      >
        {() => (
          <PriorityNavigator {...access} onPendingCount={setPendingCount} />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Profile">
        {() => (
          <ProfileScreen
            accessToken={access.accessToken}
            onSignOut={access.onSignOut}
            onSessionExpired={access.onSessionExpired}
          />
        )}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
