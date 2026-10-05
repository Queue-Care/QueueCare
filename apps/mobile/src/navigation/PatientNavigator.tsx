import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { SignInGate, stackOptions, tabOptions } from './NavigationPage';
import { PatientHomeScreen } from '../screens/PatientHomeScreen';
import { MyBookingsScreen } from '../screens/MyBookingsScreen';
import { BookingDetailsScreen } from '../screens/BookingDetailsScreen';
import { RequestPriorityScreen } from '../screens/RequestPriorityScreen';
import { RequestStatusScreen } from '../screens/RequestStatusScreen';
import { HospitalSearchScreen } from '../screens/HospitalSearchScreen';
import { HospitalDetailsScreen } from '../screens/HospitalDetailsScreen';
import {
  useBookingSubmission,
  type BookingSubmission,
} from '../features/booking/useBookingSubmission';
import { BookingConfirmationScreen } from '../screens/BookingConfirmationScreen';
import { BookAppointmentScreen } from '../screens/BookAppointmentScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useHomeFonts } from '../theme/homeFonts';
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
  onSignOut?: () => void;
  onSignIn: () => void;
  onExit?: () => void;
};

function HomeNavigator({
  guest,
  accessToken,
  patient,
  patientId,
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
          headerShown: false,
        }}
      >
        {({
          navigation,
        }: NativeStackScreenProps<HomeStackParams, 'PatientHome'>) => (
          <PatientHomeScreen
            guest={guest}
            accessToken={accessToken}
            patient={patient}
            onExit={onExit}
            onProfile={() =>
              navigation
                .getParent<BottomTabNavigationProp<PatientTabParams>>()
                .navigate('Profile')
            }
            onPriority={() =>
              navigation
                .getParent<BottomTabNavigationProp<PatientTabParams>>()
                .navigate('Bookings')
            }
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
            <BookingConfirmationScreen
              bookingId={route.params.bookingId}
              patientId={patientId}
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
              onViewBooking={bookingId =>
                navigation
                  .getParent<BottomTabNavigationProp<PatientTabParams>>()
                  .navigate('Bookings', {
                    screen: 'BookingDetails',
                    params: { bookingId },
                  })
              }
              onHome={() => navigation.popTo('PatientHome')}
            />
          )
        }
      </Home.Screen>
    </Home.Navigator>
  );
}
function BookingsNavigator({ accessToken }: { accessToken?: string }) {
  return (
    <Bookings.Navigator screenOptions={stackOptions}>
      <Bookings.Screen name="MyBookings" options={{ title: 'My bookings' }}>
        {props => <MyBookingsScreen {...props} accessToken={accessToken} />}
      </Bookings.Screen>
      <Bookings.Screen
        name="BookingDetails"
        options={{ title: 'Booking details' }}
      >
        {props => <BookingDetailsScreen {...props} accessToken={accessToken} />}
      </Bookings.Screen>
      <Bookings.Screen
        name="RequestPriority"
        options={{ title: 'Request priority' }}
      >
        {props => (
          <RequestPriorityScreen {...props} accessToken={accessToken} />
        )}
      </Bookings.Screen>
      <Bookings.Screen
        name="PriorityRequestStatus"
        options={{ title: 'Request status' }}
      >
        {props => <RequestStatusScreen {...props} accessToken={accessToken} />}
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
  onSignOut,
  onSignIn,
  onExit,
}: Access) {
  const submission = useBookingSubmission(patientId, accessToken);
  const homeFonts = useHomeFonts();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        ...tabOptions({ route }),
        tabBarInactiveTintColor: '#93A8A2',
        tabBarLabelStyle: {
          fontFamily: homeFonts.semibold,
          fontSize: 10.88,
          fontWeight: '600',
        },
        tabBarItemStyle: { paddingTop: 6, paddingBottom: 4 },
      })}
    >
      <Tabs.Screen name="Home">
        {() => (
          <HomeNavigator
            guest={guest}
            accessToken={accessToken}
            patient={patient}
            patientId={patientId}
            submission={submission}
            onSessionExpired={onSessionExpired}
            onSignIn={onSignIn}
            onExit={onExit}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Bookings">
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <BookingsNavigator accessToken={accessToken} />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Alerts">
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NotificationsScreen
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
            />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Profile">
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <ProfileScreen
              accessToken={accessToken}
              onSignOut={onSignOut}
              onSessionExpired={onSessionExpired}
            />
          )
        }
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
