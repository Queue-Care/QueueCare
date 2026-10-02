import { HttpError } from '../utils/HttpError.js';

export function errorHandler(error, _request, response, next) {
  if (response.headersSent) return next(error);
  if (error instanceof HttpError) {
    return response.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      },
    });
  }
  if (error?.type === 'entity.parse.failed') {
    return response
      .status(400)
      .json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request body must contain valid JSON.',
          fieldErrors: {},
        },
      });
  }
  if (error?.type === 'entity.too.large') {
    return response
      .status(413)
      .json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request body is too large.',
          fieldErrors: {},
        },
      });
  }
  // Never expose driver messages, connection strings, or stack traces.
  return response
    .status(500)
    .json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
        fieldErrors: {},
      },
    });
}
