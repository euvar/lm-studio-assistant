import { EventEmitter } from 'events';

export enum ErrorType {
  NETWORK = 'NETWORK',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  MODEL_OVERLOAD = 'MODEL_OVERLOAD',
  AUTHENTICATION = 'AUTHENTICATION',
  VALIDATION = 'VALIDATION',
  UNKNOWN = 'UNKNOWN'
}

export interface ErrorContext {
  operation: string;
  model?: string;
  request?: any;
  timestamp: number;
  requestId?: string;
  userId?: string;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Map<ErrorType, number>;
  errorRate: number;
  lastErrorTime?: number;
}

export class ProductionErrorHandler extends EventEmitter {
  private errorHistory: Array<{ error: Error; context: ErrorContext; type: ErrorType }> = [];
  private errorMetrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: new Map(),
    errorRate: 0,
    lastErrorTime: undefined
  };
  private userFriendlyMessages: Map<ErrorType, string> = new Map();

  constructor() {
    super();
    this.initializeUserMessages();
  }

  private initializeUserMessages(): void {
    this.userFriendlyMessages.set(
      ErrorType.NETWORK,
      'Connection issue detected. Please check your internet connection and try again.'
    );
    this.userFriendlyMessages.set(
      ErrorType.RATE_LIMIT,
      'High demand detected. Please try again in 30 seconds.'
    );
    this.userFriendlyMessages.set(
      ErrorType.TIMEOUT,
      'The request took too long. Please try with a simpler query.'
    );
    this.userFriendlyMessages.set(
      ErrorType.INVALID_RESPONSE,
      'Received an unexpected response. Please try again.'
    );
    this.userFriendlyMessages.set(
      ErrorType.MODEL_OVERLOAD,
      'The AI model is currently busy. Please wait a moment and try again.'
    );
    this.userFriendlyMessages.set(
      ErrorType.AUTHENTICATION,
      'Authentication failed. Please check your credentials.'
    );
    this.userFriendlyMessages.set(
      ErrorType.VALIDATION,
      'Invalid request format. Please check your input.'
    );
    this.userFriendlyMessages.set(
      ErrorType.UNKNOWN,
      'An unexpected error occurred. Please try again or contact support if the issue persists.'
    );
  }

  handleError(error: any, context: ErrorContext): {
    userMessage: string;
    errorId: string;
    shouldRetry: boolean;
    retryAfter?: number;
  } {
    const errorType = this.classifyError(error);
    const errorId = this.generateErrorId();

    // Record error
    this.recordError(error, context, errorType);

    // Log for developers
    this.logError(error, context, errorType, errorId);

    // Emit event for monitoring
    this.emit('error', {
      errorId,
      errorType,
      context,
      timestamp: Date.now()
    });

    // Determine retry strategy
    const retryStrategy = this.getRetryStrategy(errorType, error);

    return {
      userMessage: this.getUserMessage(errorType, errorId),
      errorId,
      shouldRetry: retryStrategy.shouldRetry,
      retryAfter: retryStrategy.retryAfter
    };
  }

  private classifyError(error: any): ErrorType {
    // Network errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND' ||
        error.message?.includes('Network')) {
      return ErrorType.NETWORK;
    }

    // HTTP status based classification
    if (error.response) {
      const status = error.response.status;
      
      if (status === 429) return ErrorType.RATE_LIMIT;
      if (status === 408 || status === 504) return ErrorType.TIMEOUT;
      if (status === 401 || status === 403) return ErrorType.AUTHENTICATION;
      if (status === 400 || status === 422) return ErrorType.VALIDATION;
      if (status === 503) return ErrorType.MODEL_OVERLOAD;
      if (status >= 500) return ErrorType.INVALID_RESPONSE;
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED' || 
        error.message?.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }

    // Response parsing errors
    if (error instanceof SyntaxError || 
        error.message?.includes('JSON')) {
      return ErrorType.INVALID_RESPONSE;
    }

    return ErrorType.UNKNOWN;
  }

  private getRetryStrategy(errorType: ErrorType, error: any): {
    shouldRetry: boolean;
    retryAfter?: number;
  } {
    switch (errorType) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
      case ErrorType.MODEL_OVERLOAD:
        return { shouldRetry: true, retryAfter: 5000 };
      
      case ErrorType.RATE_LIMIT:
        // Check for Retry-After header
        const retryAfter = error.response?.headers?.['retry-after'];
        return {
          shouldRetry: true,
          retryAfter: retryAfter ? parseInt(retryAfter) * 1000 : 30000
        };
      
      case ErrorType.INVALID_RESPONSE:
        return { shouldRetry: true, retryAfter: 2000 };
      
      case ErrorType.AUTHENTICATION:
      case ErrorType.VALIDATION:
        return { shouldRetry: false };
      
      default:
        return { shouldRetry: false };
    }
  }

  private getUserMessage(errorType: ErrorType, errorId: string): string {
    const baseMessage = this.userFriendlyMessages.get(errorType) || 
                       this.userFriendlyMessages.get(ErrorType.UNKNOWN)!;
    
    return `${baseMessage} (Error ID: ${errorId})`;
  }

  private recordError(error: Error, context: ErrorContext, type: ErrorType): void {
    // Add to history
    this.errorHistory.push({ error, context, type });
    
    // Keep only last 1000 errors
    if (this.errorHistory.length > 1000) {
      this.errorHistory.shift();
    }

    // Update metrics
    this.errorMetrics.totalErrors++;
    const typeCount = this.errorMetrics.errorsByType.get(type) || 0;
    this.errorMetrics.errorsByType.set(type, typeCount + 1);
    this.errorMetrics.lastErrorTime = Date.now();
    
    // Calculate error rate (errors per minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentErrors = this.errorHistory.filter(e => 
      e.context.timestamp > oneMinuteAgo
    ).length;
    this.errorMetrics.errorRate = recentErrors;
  }

  private logError(
    error: any, 
    context: ErrorContext, 
    type: ErrorType, 
    errorId: string
  ): void {
    const logEntry = {
      errorId,
      type,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    };

    // In production, this would go to a logging service
    if (process.env.NODE_ENV === 'production') {
      // Send to logging service
      console.error(JSON.stringify(logEntry));
    } else {
      // Development logging
      console.error('🔴 Error:', logEntry);
    }
  }

  private generateErrorId(): string {
    return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for monitoring
  getErrorMetrics(): ErrorMetrics {
    return { ...this.errorMetrics };
  }

  getRecentErrors(limit: number = 10): Array<{
    error: string;
    type: ErrorType;
    timestamp: number;
  }> {
    return this.errorHistory
      .slice(-limit)
      .map(e => ({
        error: e.error.message,
        type: e.type,
        timestamp: e.context.timestamp
      }));
  }

  clearHistory(): void {
    this.errorHistory = [];
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorRate: 0,
      lastErrorTime: undefined
    };
  }

  // Check if we're experiencing high error rate
  isHighErrorRate(threshold: number = 10): boolean {
    return this.errorMetrics.errorRate > threshold;
  }

  // Get suggestions for common errors
  getSuggestions(errorType: ErrorType): string[] {
    const suggestions: Record<ErrorType, string[]> = {
      [ErrorType.NETWORK]: [
        'Check if LM Studio is running',
        'Verify the server URL is correct',
        'Check firewall settings'
      ],
      [ErrorType.RATE_LIMIT]: [
        'Reduce request frequency',
        'Implement request queuing',
        'Use smaller models for simple tasks'
      ],
      [ErrorType.TIMEOUT]: [
        'Try a shorter prompt',
        'Increase timeout settings',
        'Use a faster model'
      ],
      [ErrorType.INVALID_RESPONSE]: [
        'Check model compatibility',
        'Verify API version',
        'Try a different model'
      ],
      [ErrorType.MODEL_OVERLOAD]: [
        'Wait a moment before retrying',
        'Use a different model',
        'Reduce concurrent requests'
      ],
      [ErrorType.AUTHENTICATION]: [
        'Check API key configuration',
        'Verify credentials',
        'Check authentication method'
      ],
      [ErrorType.VALIDATION]: [
        'Check input format',
        'Verify required parameters',
        'Review API documentation'
      ],
      [ErrorType.UNKNOWN]: [
        'Check system logs',
        'Restart LM Studio',
        'Contact support'
      ]
    };

    return suggestions[errorType] || suggestions[ErrorType.UNKNOWN];
  }
}

// Global error handler instance
export const errorHandler = new ProductionErrorHandler();