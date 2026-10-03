import React from 'react';
import { Button } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
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
import { PatientHomeScreen } from '../screens/PatientHomeScreen';
import { HospitalSearchScreen } from '../screens/HospitalSearchScreen';
import { HospitalDetailsScreen } from '../screens/HospitalDetailsScreen';
import {
  useBookingSubmission,
  type BookingSubmission,
} from '../features/booking/useBookingSubmission';
import { BookAppointmentScreen } from '../screens/BookAppointmentScreen';
import type {
  BookingsStackParams,
  HomeStackParams,
  PatientTabParams,
  PatientSummary,
} from './types';

const Tabs = createBottomTabNavigator<PatientTabParams>();
const Home = createNativeStackNavigator<HomeStackParams>();
const Bookings = createNativeStackNavigator<BookingsStackParams>();
type Access = {
  guest: boolean;
  accessToken?: string;
  patient?: PatientSummary;
  patientId?: string;
  onSessionExpired?: () => void;
  onSignIn: () => void;
  onExit?: () => void;
};

function HomeNavigator({
  guest,
  accessToken,
  patient,
  onSignIn,
  onExit,
  submission,
  onSessionExpired,
}: Access & { submission: BookingSubmission }) {
  return (
    <Home.Navigator screenOptions={stackOptions}>
      <Home.Screen
        name="PatientHome"
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
      >
        {({
          navigation,
        }: NativeStackScreenProps<HomeStackParams, 'PatientHome'>) => (
          <PatientHomeScreen
            guest={guest}
            accessToken={accessToken}
            onSignIn={onSignIn}
            onSearch={() => navigation.navigate('HospitalSearch')}
            onBookings={() =>
              navigation
                .getParent<BottomTabNavigationProp<PatientTabParams>>()
                .navigate('Bookings')
            }
            onAlerts={() =>
              navigation
                .getParent<BottomTabNavigationProp<PatientTabParams>>()
                .navigate('Alerts')
            }
            onViewBooking={bookingId =>
              navigation
                .getParent<BottomTabNavigationProp<PatientTabParams>>()
                .navigate('Bookings', {
                  screen: 'BookingDetails',
                  params: { bookingId },
                })
            }
          />
        )}
      </Home.Screen>
      <Home.Screen name="HospitalSearch" options={{ title: 'Hospital search' }}>
        {({ navigation }) => (
          <HospitalSearchScreen
            onSelectHospital={hospitalId =>
              navigation.navigate('HospitalDetails', { hospitalId })
            }
          />
        )}
      </Home.Screen>
      <Home.Screen
        name="HospitalDetails"
        options={{ title: 'Hospital details' }}
      >
        {({ route, navigation }) => (
          <HospitalDetailsScreen
            hospitalId={route.params.hospitalId}
            onSearch={() => navigation.navigate('HospitalSearch')}
            onViewSessions={serviceId =>
              navigation.navigate('BookAppointment', {
                hospitalId: route.params.hospitalId,
                serviceId,
              })
            }
          />
        )}
      </Home.Screen>
      <Home.Screen
        name="BookAppointment"
        options={{ title: 'Book appointment' }}
      >
        {({
          route,
          navigation,
        }: NativeStackScreenProps<HomeStackParams, 'BookAppointment'>) =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <BookAppointmentScreen
              key={`${route.params.hospitalId}:${route.params.serviceId ?? ''}`}
              hospitalId={route.params.hospitalId}
              serviceId={route.params.serviceId}
              patient={patient}
              submission={submission}
              onSessionExpired={onSessionExpired}
              onConfirmed={bookingId =>
                navigation.isFocused() &&
                navigation.replace('BookingConfirmation', { bookingId })
              }
              onBookings={() =>
                navigation
                  .getParent<BottomTabNavigationProp<PatientTabParams>>()
                  .navigate('Bookings')
              }
              onChooseHospital={() => navigation.navigate('HospitalSearch')}
            />
          )
        }
      </Home.Screen>
      <Home.Screen
        name="BookingConfirmation"
        options={{ title: 'Booking confirmation' }}
      >
        {({
          route,
          navigation,
        }: NativeStackScreenProps<HomeStackParams, 'BookingConfirmation'>) =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NavigationPage
              title="Booking confirmation"
              description={`Booking reference: ${route.params.bookingId}`}
              actions={[
                {
                  label: 'View booking',
                  onPress: () =>
                    navigation
                      .getParent<BottomTabNavigationProp<PatientTabParams>>()
                      .navigate('Bookings', {
                        screen: 'BookingDetails',
                        params: { bookingId: route.params.bookingId },
                      }),
                },
                {
                  label: 'Back to Home',
                  onPress: () => navigation.popTo('PatientHome'),
                },
              ]}
            />
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
export function PatientNavigator({
  guest,
  accessToken,
  patient,
  patientId,
  onSessionExpired,
  onSignIn,
  onExit,
}: Access) {
  const submission = useBookingSubmission(patientId, accessToken);
  return (
    <Tabs.Navigator screenOptions={tabOptions}>
      <Tabs.Screen name="Home">
        {() => (
          <HomeNavigator
            guest={guest}
            accessToken={accessToken}
            patient={patient}
            submission={submission}
            onSessionExpired={onSessionExpired}
            onSignIn={onSignIn}
            onExit={onExit}
          />
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
