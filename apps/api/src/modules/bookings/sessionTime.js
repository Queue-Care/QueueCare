import { SESSION_TIME_ZONE } from '../hospitals/sessionQuery.js';

export const sessionTimestamp = (field) => ({
  $dateFromString: {
    dateString: {
      $concat: [
        {
          $dateToString: {
            date: '$sessionDate',
            format: '%Y-%m-%d',
            timezone: 'UTC',
          },
        },
        'T',
        `$${field}`,
        ':00',
      ],
    },
    format: '%Y-%m-%dT%H:%M:%S',
    timezone: SESSION_TIME_ZONE,
    onError: null,
    onNull: null,
  },
});
