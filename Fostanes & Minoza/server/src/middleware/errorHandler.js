/**
 * Global error handler middleware.
 * Catches all errors and returns consistent JSON responses.
 */
export function errorHandler(err, req, res, _next) {
  // Log full error server-side
  console.error(`[Error] ${req.method} ${req.path}:`, {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Known application errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      errors: [{ code: err.code || 'ERROR', message: err.message }],
    });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(422).json({
      success: false,
      data: null,
      errors: err.issues.map(issue => ({
        code: 'VALIDATION_FAILED',
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      data: null,
      errors: [{ code: 'DUPLICATE', message: 'Resource already exists' }],
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      data: null,
      errors: [{ code: 'REFERENCE_ERROR', message: 'Referenced resource not found' }],
    });
  }

  // Unknown errors — never expose internals
  return res.status(500).json({
    success: false,
    data: null,
    errors: [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }],
  });
}

/**
 * Custom application error class.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 422, 'VALIDATION_FAILED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}
