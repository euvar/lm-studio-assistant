import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { LMStudioProvider } from '../providers/lmstudio.js';

export interface ErrorSnapshot {
    id: string;
    timestamp: Date;
    error: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
    };
    context: {
        file?: string;
        line?: number;
        function?: string;
        variables?: Record<string, any>;
    };
    systemState: {
        memory: NodeJS.MemoryUsage;
        uptime: number;
        platform: string;
        nodeVersion: string;
    };
    recovery?: {
        attempted: boolean;
        successful?: boolean;
        method?: string;
        result?: any;
    };
}

export interface RecoveryStrategy {
    name: string;
    description: string;
    applicableErrors: RegExp[];
    execute: (error: Error, context: any) => Promise<any>;
    priority: number;
}

export class ErrorRecoverySystem extends EventEmitter {
    private errorHistory: ErrorSnapshot[] = [];
    private recoveryStrategies: RecoveryStrategy[] = [];
    private maxHistorySize = 1000;
    private errorPatterns: Map<string, number> = new Map();
    private recoveryCache: Map<string, any> = new Map();
    
    constructor(private provider?: LMStudioProvider) {
        super();
        this.initializeDefaultStrategies();
    }
    
    // Initialize default recovery strategies
    private initializeDefaultStrategies(): void {
        // File not found recovery
        this.addRecoveryStrategy({
            name: 'file-not-found',
            description: 'Handle missing file errors',
            applicableErrors: [/ENOENT/, /no such file/i],
            priority: 10,
            execute: async (error, context) => {
                if (context.file) {
                    // Try to find similar files
                    const dir = path.dirname(context.file);
                    const basename = path.basename(context.file);
                    
                    try {
                        const files = await fs.readdir(dir);
                        const similar = files.filter(f => 
                            f.toLowerCase().includes(basename.toLowerCase()) ||
                            this.calculateSimilarity(f, basename) > 0.7
                        );
                        
                        if (similar.length > 0) {
                            return {
                                suggestion: 'similar_files_found',
                                files: similar,
                                message: `Did you mean: ${similar[0]}?`
                            };
                        }
                    } catch {}
                    
                    // Suggest creating the file
                    return {
                        suggestion: 'create_file',
                        message: 'File not found. Would you like to create it?'
                    };
                }
            }
        });
        
        // Permission denied recovery
        this.addRecoveryStrategy({
            name: 'permission-denied',
            description: 'Handle permission errors',
            applicableErrors: [/EACCES/, /permission denied/i],
            priority: 10,
            execute: async (error, context) => {
                if (context.file) {
                    try {
                        const stats = await fs.stat(context.file);
                        const mode = stats.mode.toString(8);
                        
                        return {
                            suggestion: 'fix_permissions',
                            currentMode: mode,
                            recommendedMode: '644',
                            command: `chmod 644 "${context.file}"`,
                            message: 'Permission denied. Try changing file permissions.'
                        };
                    } catch {}
                }
                
                return {
                    suggestion: 'run_with_sudo',
                    message: 'Permission denied. You may need elevated privileges.'
                };
            }
        });
        
        // Out of memory recovery
        this.addRecoveryStrategy({
            name: 'out-of-memory',
            description: 'Handle memory errors',
            applicableErrors: [/heap out of memory/i, /ENOMEM/],
            priority: 20,
            execute: async (error, context) => {
                const memUsage = process.memoryUsage();
                
                return {
                    suggestion: 'increase_memory',
                    currentHeap: Math.round(memUsage.heapUsed / 1024 / 1024),
                    maxHeap: Math.round(memUsage.heapTotal / 1024 / 1024),
                    commands: [
                        'node --max-old-space-size=4096 script.js',
                        'export NODE_OPTIONS="--max-old-space-size=4096"'
                    ],
                    message: 'Out of memory. Consider increasing Node.js heap size.'
                };
            }
        });
        
        // Network error recovery
        this.addRecoveryStrategy({
            name: 'network-error',
            description: 'Handle network connectivity issues',
            applicableErrors: [/ECONNREFUSED/, /ETIMEDOUT/, /ENOTFOUND/],
            priority: 15,
            execute: async (error, context) => {
                const suggestions = [];
                
                if (error.message.includes('ECONNREFUSED')) {
                    suggestions.push({
                        action: 'check_service',
                        message: 'Connection refused. Is the service running?'
                    });
                }
                
                if (error.message.includes('ETIMEDOUT')) {
                    suggestions.push({
                        action: 'retry_with_timeout',
                        message: 'Connection timed out. Try increasing timeout or checking network.'
                    });
                }
                
                return {
                    suggestion: 'network_troubleshooting',
                    suggestions,
                    checks: [
                        'Check if the service is running',
                        'Verify network connectivity',
                        'Check firewall settings',
                        'Verify correct host and port'
                    ]
                };
            }
        });
        
        // Syntax error recovery
        this.addRecoveryStrategy({
            name: 'syntax-error',
            description: 'Handle code syntax errors',
            applicableErrors: [/SyntaxError/, /Unexpected token/],
            priority: 5,
            execute: async (error, context) => {
                if (this.provider && context.code) {
                    // Use AI to fix syntax error
                    const fixedCode = await this.aiFixSyntax(context.code, error.message);
                    
                    return {
                        suggestion: 'auto_fix',
                        fixedCode,
                        message: 'Syntax error detected. Here\'s a potential fix.'
                    };
                }
                
                return {
                    suggestion: 'manual_fix',
                    message: 'Syntax error detected. Check for missing brackets, quotes, or semicolons.'
                };
            }
        });
    }
    
    // Add custom recovery strategy
    addRecoveryStrategy(strategy: RecoveryStrategy): void {
        this.recoveryStrategies.push(strategy);
        this.recoveryStrategies.sort((a, b) => b.priority - a.priority);
    }
    
    // Main error handling method
    async handleError(error: Error, context?: any): Promise<ErrorSnapshot> {
        const snapshot = this.createErrorSnapshot(error, context);
        
        // Add to history
        this.errorHistory.push(snapshot);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
        }
        
        // Update error patterns
        const errorKey = `${error.name}:${error.message}`;
        this.errorPatterns.set(errorKey, (this.errorPatterns.get(errorKey) || 0) + 1);
        
        // Attempt recovery
        const recovery = await this.attemptRecovery(error, context);
        snapshot.recovery = recovery;
        
        // Emit event
        this.emit('errorHandled', snapshot);
        
        return snapshot;
    }
    
    // Attempt automatic recovery
    private async attemptRecovery(error: Error, context: any): Promise<any> {
        const cacheKey = `${error.name}:${error.message}:${JSON.stringify(context)}`;
        
        // Check cache
        if (this.recoveryCache.has(cacheKey)) {
            const cached = this.recoveryCache.get(cacheKey);
            if (cached.timestamp > Date.now() - 300000) { // 5 minutes
                return {
                    attempted: true,
                    successful: true,
                    method: 'cached',
                    result: cached.result
                };
            }
        }
        
        // Find applicable strategies
        const applicable = this.recoveryStrategies.filter(strategy =>
            strategy.applicableErrors.some(pattern => pattern.test(error.message))
        );
        
        // Try strategies in order of priority
        for (const strategy of applicable) {
            try {
                const result = await strategy.execute(error, context);
                
                if (result) {
                    // Cache successful recovery
                    this.recoveryCache.set(cacheKey, {
                        timestamp: Date.now(),
                        result
                    });
                    
                    return {
                        attempted: true,
                        successful: true,
                        method: strategy.name,
                        result
                    };
                }
            } catch (strategyError) {
                console.error(`Recovery strategy ${strategy.name} failed:`, strategyError);
            }
        }
        
        // If AI provider available, try AI-based recovery
        if (this.provider) {
            try {
                const aiRecovery = await this.aiAssistedRecovery(error, context);
                if (aiRecovery) {
                    return {
                        attempted: true,
                        successful: true,
                        method: 'ai_assisted',
                        result: aiRecovery
                    };
                }
            } catch {}
        }
        
        return {
            attempted: true,
            successful: false,
            method: 'none'
        };
    }
    
    // AI-assisted error recovery
    private async aiAssistedRecovery(error: Error, context: any): Promise<any> {
        const prompt = `Help recover from this error:

Error: ${error.name}: ${error.message}
Stack: ${error.stack}
Context: ${JSON.stringify(context, null, 2)}

Provide recovery steps and potential fixes.`;
        
        try {
            const response = await this.provider!.chat([
                { role: 'system', content: 'You are an error recovery expert. Provide actionable recovery solutions.' },
                { role: 'user', content: prompt }
            ]);
            
            return this.parseAIRecoveryResponse(response.content);
        } catch {
            return null;
        }
    }
    
    // Create error snapshot
    private createErrorSnapshot(error: Error, context?: any): ErrorSnapshot {
        return {
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: (error as any).code
            },
            context: context || {},
            systemState: {
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                platform: process.platform,
                nodeVersion: process.version
            }
        };
    }
    
    // Get error analytics
    async getErrorAnalytics(): Promise<{
        topErrors: Array<{ error: string; count: number }>;
        errorTrends: Array<{ hour: number; count: number }>;
        recoverySuccess: number;
        recommendations: string[];
    }> {
        // Top errors
        const topErrors = Array.from(this.errorPatterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([error, count]) => ({ error, count }));
        
        // Error trends by hour
        const hourCounts = new Map<number, number>();
        const now = new Date();
        
        this.errorHistory.forEach(snapshot => {
            const hoursDiff = Math.floor((now.getTime() - snapshot.timestamp.getTime()) / 3600000);
            if (hoursDiff < 24) {
                hourCounts.set(hoursDiff, (hourCounts.get(hoursDiff) || 0) + 1);
            }
        });
        
        const errorTrends = Array.from(hourCounts.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([hour, count]) => ({ hour, count }));
        
        // Recovery success rate
        const recoveryAttempts = this.errorHistory.filter(s => s.recovery?.attempted);
        const successfulRecoveries = recoveryAttempts.filter(s => s.recovery?.successful);
        const recoverySuccess = recoveryAttempts.length > 0
            ? (successfulRecoveries.length / recoveryAttempts.length) * 100
            : 0;
        
        // Get AI recommendations if available
        const recommendations = this.provider
            ? await this.getAIRecommendations(topErrors)
            : this.getDefaultRecommendations(topErrors);
        
        return {
            topErrors,
            errorTrends,
            recoverySuccess,
            recommendations
        };
    }
    
    // Get AI recommendations
    private async getAIRecommendations(topErrors: Array<{ error: string; count: number }>): Promise<string[]> {
        const prompt = `Based on these top errors, provide recommendations for improving error handling:

${topErrors.map(e => `- ${e.error} (${e.count} times)`).join('\n')}

Provide 3-5 actionable recommendations.`;
        
        try {
            const response = await this.provider!.chat([
                { role: 'system', content: 'You are an error handling expert.' },
                { role: 'user', content: prompt }
            ]);
            
            return this.extractRecommendations(response.content);
        } catch {
            return this.getDefaultRecommendations(topErrors);
        }
    }
    
    // Default recommendations
    private getDefaultRecommendations(topErrors: Array<{ error: string; count: number }>): string[] {
        const recommendations: string[] = [];
        
        if (topErrors.some(e => e.error.includes('ENOENT'))) {
            recommendations.push('Implement file existence checks before operations');
        }
        
        if (topErrors.some(e => e.error.includes('EACCES'))) {
            recommendations.push('Review file permissions and access controls');
        }
        
        if (topErrors.some(e => e.error.includes('memory'))) {
            recommendations.push('Optimize memory usage and implement memory monitoring');
        }
        
        if (topErrors.some(e => e.error.includes('ECONNREFUSED'))) {
            recommendations.push('Add retry logic for network operations');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('Implement comprehensive error logging');
            recommendations.push('Add error recovery strategies');
            recommendations.push('Set up error monitoring and alerting');
        }
        
        return recommendations;
    }
    
    // Helper methods
    private calculateSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }
    
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    private async aiFixSyntax(code: string, errorMessage: string): Promise<string> {
        const prompt = `Fix this syntax error:

Error: ${errorMessage}

Code:
${code}

Return only the fixed code.`;
        
        try {
            const response = await this.provider!.chat([
                { role: 'system', content: 'You are a code fixer. Fix syntax errors and return corrected code.' },
                { role: 'user', content: prompt }
            ]);
            
            return response.content;
        } catch {
            return code;
        }
    }
    
    private parseAIRecoveryResponse(response: string): any {
        try {
            // Try to parse as JSON first
            return JSON.parse(response);
        } catch {
            // Parse as text
            return {
                steps: response.split('\n').filter(line => line.trim()),
                message: response.split('\n')[0]
            };
        }
    }
    
    private extractRecommendations(response: string): string[] {
        const lines = response.split('\n');
        const recommendations: string[] = [];
        
        for (const line of lines) {
            if (line.match(/^\d+\.\s+/) || line.match(/^[-*]\s+/)) {
                recommendations.push(line.replace(/^[\d.\-\*]+\s+/, '').trim());
            }
        }
        
        return recommendations;
    }
    
    // Public methods for error history
    getErrorHistory(limit?: number): ErrorSnapshot[] {
        return limit ? this.errorHistory.slice(-limit) : this.errorHistory;
    }
    
    clearErrorHistory(): void {
        this.errorHistory = [];
        this.errorPatterns.clear();
        this.recoveryCache.clear();
        this.emit('historyCleared');
    }
    
    exportErrorReport(): string {
        const report = {
            generated: new Date().toISOString(),
            totalErrors: this.errorHistory.length,
            uniqueErrors: this.errorPatterns.size,
            topErrors: Array.from(this.errorPatterns.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20),
            recentErrors: this.errorHistory.slice(-10),
            systemInfo: {
                platform: process.platform,
                nodeVersion: process.version,
                uptime: process.uptime()
            }
        };
        
        return JSON.stringify(report, null, 2);
    }
}