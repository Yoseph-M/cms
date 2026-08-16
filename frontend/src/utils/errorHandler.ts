/**
 * Error Handler Utility
 * 
 * Provides consistent error message extraction from API responses.
 * Handles both the new structured error format and legacy string format.
 */

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    field?: string;
  } | string;
}

/**
 * Extract error message from Axios error response
 * 
 * @param err - Axios error object
 * @param fallback - Default message if extraction fails
 * @returns Human-readable error message
 */
export function extractErrorMessage(err: any, fallback: string = 'An error occurred'): string {
  // Check if there's a response with error data
  if (err.response?.data?.error) {
    const errorData = err.response.data.error;
    
    // New structure: { code, message, requestId, field? }
    if (typeof errorData === 'object' && errorData.message) {
      return errorData.message;
    }
    
    // Legacy structure: plain string
    if (typeof errorData === 'string') {
      return errorData;
    }
  }
  
  // Fallback to err.message if available
  if (err.message) {
    return err.message;
  }
  
  return fallback;
}

/**
 * Extract full error object for logging/debugging
 * 
 * @param err - Axios error object
 * @returns Error details object
 */
export function extractErrorDetails(err: any): {
  message: string;
  code?: string;
  requestId?: string;
  field?: string;
  statusCode?: number;
} {
  const statusCode = err.response?.status;
  
  if (err.response?.data?.error) {
    const errorData = err.response.data.error;
    
    // New structured format
    if (typeof errorData === 'object') {
      return {
        message: errorData.message || 'An error occurred',
        code: errorData.code,
        requestId: errorData.requestId,
        field: errorData.field,
        statusCode,
      };
    }
    
    // Legacy string format
    if (typeof errorData === 'string') {
      return {
        message: errorData,
        statusCode,
      };
    }
  }
  
  return {
    message: err.message || 'An error occurred',
    statusCode,
  };
}
