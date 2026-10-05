import type { NavigatorScreenParams } from '@react-navigation/native';

// Display fields from the validated account/profile response, never route params.
export type PatientSummary = { fullName: string; nic?: string };
export type StaffSummary = {
  fullName: string;
  staffId: string;
  hospital: string;
};

// The authentication owner supplies this only after validating the session.
export type NavigationSession = {
  userId: string;
  // Supplied in memory by S-13; never read from a public environment variable.
  accessToken?: string;
  patient?: PatientSummary;
  staff?: StaffSummary;
  role: 'PATIENT' | 'RECEPTION' | 'NURSE';
};

export type PatientAuthParams = {
  PatientSignIn: undefined;
  PatientCreateAccount: undefined;
  VerifyMobile: { verificationId: string };
  ResetPassword: undefined;
};
export type StaffAuthParams = {
  StaffSignIn: { staffId?: string } | undefined;
  StaffRegistration: undefined;
  StaffVerification: { verificationId: string };
  ResetPassword: undefined;
};
export type HomeStackParams = {
  PatientHome: undefined;
  HospitalSearch: undefined;
  HospitalDetails: { hospitalId: string };
  BookAppointment: {
    hospitalId: string;
    serviceId?: string;
    sessionId?: string;
  };
  BookingConfirmation: { bookingId: string };
};
export type BookingsStackParams = {
  MyBookings: undefined;
  BookingDetails: { bookingId: string };
  RequestPriority: { bookingId: string };
  PriorityRequestStatus: { requestId: string };
};
export type PatientTabParams = {
  Home: NavigatorScreenParams<HomeStackParams> | undefined;
  Bookings: NavigatorScreenParams<BookingsStackParams> | undefined;
  Alerts: undefined;
  Profile: undefined;
};
export type SessionsStackParams = {
  SessionsList: undefined;
  AddEditSession: { sessionId?: string } | undefined;
};
export type PriorityStackParams = {
  PriorityRequests: undefined;
  PriorityRequestDetails: { requestId: string };
};
export type DashboardStackParams = {
  ReceptionDashboard: undefined;
  StaffNotifications: undefined;
};
export type StaffTabParams = {
  Dashboard: NavigatorScreenParams<DashboardStackParams> | undefined;
  Sessions: NavigatorScreenParams<SessionsStackParams> | undefined;
  Priority: NavigatorScreenParams<PriorityStackParams> | undefined;
  Profile: undefined;
};
export type RootStackParams = {
  Welcome: undefined;
  ChooseRole: { intent: 'register' | 'signIn' };
  PatientAuth: NavigatorScreenParams<PatientAuthParams> | undefined;
  StaffAuth: NavigatorScreenParams<StaffAuthParams> | undefined;
  Guest: NavigatorScreenParams<PatientTabParams> | undefined;
  PatientApp: NavigatorScreenParams<PatientTabParams> | undefined;
  StaffApp: NavigatorScreenParams<StaffTabParams> | undefined;
};
