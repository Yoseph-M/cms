/**
 * Typed Application Errors
 * 
 * These error classes provide machine-readable error codes
 * for API error responses.
 */

/**
 * Base error class with code property
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;

  constructor(message: string, code: string, statusCode: number, field?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 Bad Request Errors
export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400, field);
  }
}

export class InvalidAmountError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_AMOUNT', 400);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_TRANSITION', 400);
  }
}

// 401 Unauthorized Errors
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

// 403 Forbidden Errors
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_PERMISSIONS', 403);
  }
}

// 404 Not Found Errors
export class NotFoundError extends AppError {
  constructor(entityName: string, identifier?: string) {
    const message = identifier
      ? `${entityName} with identifier ${identifier} not found`
      : `${entityName} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

// 409 Conflict Errors
export class ConflictError extends AppError {
  constructor(message: string, code: string = 'CONFLICT') {
    super(message, code, 409);
  }
}

export class AlreadyExistsError extends AppError {
  constructor(entityName: string) {
    super(`${entityName} already exists`, 'ALREADY_EXISTS', 409);
  }
}

export class ConcurrentModificationError extends AppError {
  constructor(entityName: string) {
    super(`${entityName} was modified concurrently. Please retry.`, 'CONCURRENT_MODIFICATION', 409);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message: string) {
    super(message, 'IDEMPOTENCY_CONFLICT', 409);
  }
}

// Settlement-specific Errors
export class AlreadySettledError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} has already been settled.`, 'ALREADY_SETTLED', 409);
  }
}

export class SettlementOverageError extends AppError {
  constructor(remaining: number) {
    super(`Settlement amount exceeds remaining amount of ${remaining}.`, 'SETTLEMENT_OVERAGE', 409, 'amountMinor');
  }
}

export class OrderAlreadyCancelledError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} has been cancelled and cannot be settled.`, 'ORDER_ALREADY_CANCELLED', 409);
  }
}

// Cancellation-specific Errors
export class PendingCancellationExistsError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} already has a pending cancellation request.`, 'PENDING_CANCELLATION_EXISTS', 409);
  }
}

export class CancellationRequestNotPendingError extends AppError {
  constructor(requestId: string, currentStatus: string) {
    super(`Cancellation request ${requestId} is not pending (current status: ${currentStatus}).`, 'CANCELLATION_NOT_PENDING', 409);
  }
}

export class CannotCancelSettledOrderError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} is settled or partially settled and cannot be cancelled.`, 'CANNOT_CANCEL_SETTLED_ORDER', 409);
  }
}

// 422 Unprocessable Entity
export class UnprocessableEntityError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 'UNPROCESSABLE_ENTITY', 422, field);
  }
}

// 500 Internal Server Error
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 'INTERNAL_SERVER_ERROR', 500);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 'DATABASE_ERROR', 500);
  }
}

export class TransactionError extends AppError {
  constructor(message: string) {
    super(message, 'TRANSACTION_ERROR', 500);
  }
}
