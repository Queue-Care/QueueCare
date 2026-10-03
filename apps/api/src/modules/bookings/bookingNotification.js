import { ObjectId } from 'mongodb';

// Member 1's booking event producer. Member 4 owns notification list/read APIs.
export async function ensureBookingNotificationIndexes(db) {
  await db.collection('notifications').createIndex(
    { userId: 1, 'data.bookingId': 1, 'data.event': 1 },
    {
      name: 'notification_booking_confirmed_unique',
      unique: true,
      partialFilterExpression: {
        type: 'BOOKING',
        'data.event': 'BOOKING_CONFIRMED',
        'data.bookingId': { $type: 'objectId' },
      },
    }
  );
}

export async function insertBookingConfirmation(db, booking, session) {
  if (!session?.inTransaction())
    throw new TypeError(
      'Booking notifications require the booking transaction.'
    );
  // Only MongoDB writes here: withTransaction may run this callback again.
  // Failed attempts roll back the notification alongside booking and capacity.
  await db.collection('notifications').insertOne(
    {
      _id: new ObjectId(),
      userId: booking.patientId,
      type: 'BOOKING',
      title: 'Booking confirmed',
      message: `Your booking ${booking.bookingCode} is confirmed. Open your booking for appointment details.`,
      data: {
        event: 'BOOKING_CONFIRMED',
        bookingId: booking._id,
        sessionId: booking.sessionId,
      },
      readAt: null,
      createdAt: booking.createdAt,
    },
    { session }
  );
}
