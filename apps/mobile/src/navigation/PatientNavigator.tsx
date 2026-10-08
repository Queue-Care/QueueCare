import React, { useEffect } from 'react';
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
import { isAppLanguage, setLanguage, useT } from '../i18n/g_language';
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
  const t = useT();
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
                .navigate('Bookings', {
                  screen: 'PriorityRequestStatus',
                  params: {},
                  initial: false,
                })
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
      <Home.Screen name="HospitalSearch" options={{ title: t('Hospital search') }}>
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
        options={{ title: t('Hospital details') }}
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
        options={{ title: t('Book appointment') }}
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
        options={{ title: t('Booking confirmation') }}
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
  const t = useT();
  return (
    <Bookings.Navigator screenOptions={stackOptions}>
      <Bookings.Screen name="MyBookings" options={{ title: t('My bookings') }}>
        {props => <MyBookingsScreen {...props} accessToken={accessToken} />}
      </Bookings.Screen>
      <Bookings.Screen
        name="BookingDetails"
        options={{ title: t('Booking details') }}
      >
        {props => <BookingDetailsScreen {...props} accessToken={accessToken} />}
      </Bookings.Screen>
      <Bookings.Screen
        name="RequestPriority"
        options={{ title: t('Request priority') }}
      >
        {props => (
          <RequestPriorityScreen {...props} accessToken={accessToken} />
        )}
      </Bookings.Screen>
      <Bookings.Screen
        name="PriorityRequestStatus"
        options={{ title: t('Request status') }}
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
  const t = useT();
  // Patient screens open in the language saved on the account. Guests, and the
  // screens shown after signing out, stay in English.
  const savedLanguage = guest ? undefined : patient?.preferredLanguage;
  useEffect(() => {
    setLanguage(isAppLanguage(savedLanguage) ? savedLanguage : 'en');
    return () => setLanguage('en');
  }, [savedLanguage]);
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
      <Tabs.Screen name="Home" options={{ tabBarLabel: t('Home') }}>
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
      <Tabs.Screen name="Bookings" options={{ tabBarLabel: t('Bookings') }}>
        {() =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <BookingsNavigator accessToken={accessToken} />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Alerts" options={{ tabBarLabel: t('Alerts') }}>
        {({ navigation }) =>
          guest ? (
            <SignInGate onSignIn={onSignIn} />
          ) : (
            <NotificationsScreen
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
              onOpenBooking={bookingId =>
                navigation.navigate('Bookings', {
                  screen: 'BookingDetails',
                  params: { bookingId },
                })
              }
            />
          )
        }
      </Tabs.Screen>
      <Tabs.Screen name="Profile" options={{ tabBarLabel: t('Profile') }}>
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
