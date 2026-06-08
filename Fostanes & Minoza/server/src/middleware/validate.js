/**
 * Zod validation middleware factory.
 * Validates req.body against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        success: false,
        data: null,
        errors: result.error.issues.map(issue => ({
          code: 'VALIDATION_FAILED',
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.validated = result.data;
    next();
  };
}

/**
 * Validate query parameters.
 * @param {import('zod').ZodSchema} schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        data: null,
        errors: result.error.issues.map(issue => ({
          code: 'INVALID_QUERY',
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}
