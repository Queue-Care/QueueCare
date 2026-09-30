import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { NavigationPage, stackOptions, tabOptions } from './NavigationPage';
import type {
  PriorityStackParams,
  SessionsStackParams,
  StaffTabParams,
} from './types';

const Tabs = createBottomTabNavigator<StaffTabParams>();
const Sessions = createNativeStackNavigator<SessionsStackParams>();
const Priority = createNativeStackNavigator<PriorityStackParams>();

function ReceptionDashboard({
  navigation,
}: BottomTabScreenProps<StaffTabParams, 'Dashboard'>) {
  return (
    <NavigationPage
      title="Reception dashboard"
      actions={[
        {
          label: 'View sessions',
          onPress: () => navigation.navigate('Sessions'),
        },
        {
          label: 'Priority requests',
          onPress: () => navigation.navigate('Priority'),
        },
      ]}
    />
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
function PriorityNavigator() {
  return (
    <Priority.Navigator screenOptions={stackOptions}>
      <Priority.Screen
        name="PriorityRequests"
        options={{ title: 'Priority requests' }}
      >
        {() => <NavigationPage title="Priority requests" />}
      </Priority.Screen>
      <Priority.Screen
        name="PriorityRequestDetails"
        options={{ title: 'Request details' }}
      >
        {() => <NavigationPage title="Priority request details" />}
      </Priority.Screen>
    </Priority.Navigator>
  );
}
export function StaffNavigator() {
  return (
    <Tabs.Navigator screenOptions={tabOptions}>
      <Tabs.Screen name="Dashboard" component={ReceptionDashboard} />
      <Tabs.Screen name="Sessions" component={SessionsNavigator} />
      <Tabs.Screen name="Priority" component={PriorityNavigator} />
      <Tabs.Screen name="Profile">
        {() => <NavigationPage title="Staff profile" />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
