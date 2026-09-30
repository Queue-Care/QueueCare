import React from 'react';
import { Button } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  NavigationPage,
  SignInGate,
  stackOptions,
  tabOptions,
} from './NavigationPage';
import type {
  BookingsStackParams,
  HomeStackParams,
  PatientTabParams,
} from './types';

const Tabs = createBottomTabNavigator<PatientTabParams>();
const Home = createNativeStackNavigator<HomeStackParams>();
const Bookings = createNativeStackNavigator<BookingsStackParams>();
type Access = { guest: boolean; onSignIn: () => void; onExit?: () => void };

function PatientHome({
  navigation,
}: NativeStackScreenProps<HomeStackParams, 'PatientHome'>) {
  return (
    <NavigationPage
      title="Welcome to QueueCare"
      description="Find a hospital and plan your OPD visit."
      actions={[
        {
          label: 'Search hospitals',
          onPress: () => navigation.navigate('HospitalSearch'),
        },
      ]}
    />
  );
}
function HomeNavigator({ guest, onSignIn, onExit }: Access) {
  return (
    <Home.Navigator screenOptions={stackOptions}>
      <Home.Screen
        name="PatientHome"
        component={PatientHome}
        options={{
          title: 'QueueCare',
          headerLeft: onExit
            ? () => (
                <Button
                  title="Welcome"
                  accessibilityLabel="Back to welcome"
                  onPress={onExit}
                />
              )
            : undefined,
        }}
      />
      <Home.Screen name="HospitalSearch" options={{ title: 'Hospital search' }}>
        {() => <NavigationPage title="Hospital search" />}
      </Home.Screen>
      <Home.Screen
        name="HospitalDetails"
        options={{ title: 'Hospital details' }}
      >
        {() => <NavigationPage title="Hospital details" />}
      </Home.Screen>
      <Home.Screen
        name="BookAppointment"
        options={{ title: 'Book appointment' }}
      >
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NavigationPage title="Book appointment" />
          )
        }
      </Home.Screen>
      <Home.Screen
        name="BookingConfirmation"
        options={{ title: 'Booking confirmation' }}
      >
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NavigationPage title="Booking confirmation" />
          )
        }
      </Home.Screen>
    </Home.Navigator>
  );
}
function BookingsNavigator() {
  return (
    <Bookings.Navigator screenOptions={stackOptions}>
      <Bookings.Screen name="MyBookings" options={{ title: 'My bookings' }}>
        {() => <NavigationPage title="My bookings" />}
      </Bookings.Screen>
      <Bookings.Screen
        name="BookingDetails"
        options={{ title: 'Booking details' }}
      >
        {() => <NavigationPage title="Booking details" />}
      </Bookings.Screen>
      <Bookings.Screen
        name="RequestPriority"
        options={{ title: 'Request priority' }}
      >
        {() => <NavigationPage title="Request priority" />}
      </Bookings.Screen>
      <Bookings.Screen
        name="PriorityRequestStatus"
        options={{ title: 'Request status' }}
      >
        {() => <NavigationPage title="Priority request status" />}
      </Bookings.Screen>
    </Bookings.Navigator>
  );
}
export function PatientNavigator({ guest, onSignIn, onExit }: Access) {
  return (
    <Tabs.Navigator screenOptions={tabOptions}>
      <Tabs.Screen name="Home">
        {() => (
          <HomeNavigator guest={guest} onSignIn={onSignIn} onExit={onExit} />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Bookings">
        {() =>
          guest ? <SignInGate onSignIn={onSignIn} /> : <BookingsNavigator />
        }
      </Tabs.Screen>
      <Tabs.Screen name="Alerts">
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NavigationPage title="Notifications" />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Profile">
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NavigationPage title="Profile" />
          )
        }
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
