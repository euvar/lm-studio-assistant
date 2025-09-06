import chalk from 'chalk';

export interface ErrorContext {
  operation: string;
  details?: string;
  suggestion?: string;
}

export class AssistantError extends Error {
  constructor(
    message: string,
    public context?: ErrorContext,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

export class ErrorHandler {
  static handle(error: Error | unknown): string {
    if (error instanceof AssistantError) {
      return this.formatAssistantError(error);
    }
    
    if (error instanceof Error) {
      return this.formatGenericError(error);
    }
    
    return chalk.red('An unknown error occurred');
  }

  private static formatAssistantError(error: AssistantError): string {
    let message = chalk.red(`❌ ${error.message}`);
    
    if (error.context) {
      if (error.context.operation) {
        message += chalk.dim(`\n   During: ${error.context.operation}`);
      }
      
      if (error.context.details) {
        message += chalk.dim(`\n   Details: ${error.context.details}`);
      }
      
      if (error.context.suggestion) {
        message += chalk.yellow(`\n   💡 Try: ${error.context.suggestion}`);
      }
    }
    
    return message;
  }

  private static formatGenericError(error: Error): string {
    // Common error patterns
    const errorPatterns: Record<string, { message: string; suggestion: string }> = {
      ENOENT: {
        message: 'File or directory not found',
        suggestion: 'Check if the path exists or create it first',
      },
      EACCES: {
        message: 'Permission denied',
        suggestion: 'Check file permissions or try with sudo',
      },
      ECONNREFUSED: {
        message: 'Connection refused',
        suggestion: 'Make sure LM Studio is running',
      },
      ETIMEDOUT: {
        message: 'Operation timed out',
        suggestion: 'Try again or check your internet connection',
      },
      MODULE_NOT_FOUND: {
        message: 'Module not found',
        suggestion: 'Run npm install to install dependencies',
      },
    };

    // Check for known error codes
    const errorCode = (error as any).code;
    if (errorCode && errorPatterns[errorCode]) {
      const pattern = errorPatterns[errorCode];
      return chalk.red(`❌ ${pattern.message}\n`) + 
             chalk.yellow(`💡 ${pattern.suggestion}`);
    }

    // Default error formatting
    return chalk.red(`❌ ${error.message}`);
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | unknown;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries) {
          console.log(chalk.yellow(`⚠️  Attempt ${i + 1} failed, retrying in ${delayMs}ms...`));
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2; // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }
}