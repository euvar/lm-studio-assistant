import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { LMStudioProvider } from '../providers/lmstudio.js';

const execAsync = promisify(exec);

export interface BreakpointInfo {
    file: string;
    line: number;
    condition?: string;
    hitCount?: number;
    logMessage?: string;
}

export interface VariableInfo {
    name: string;
    value: any;
    type: string;
    scope: string;
}

export interface StackFrame {
    index: number;
    function: string;
    file: string;
    line: number;
    column: number;
}

export interface DebugSession {
    id: string;
    type: 'node' | 'python' | 'browser';
    status: 'running' | 'paused' | 'stopped';
    breakpoints: BreakpointInfo[];
    currentFrame?: StackFrame;
    variables: VariableInfo[];
    callStack: StackFrame[];
}

export class AdvancedDebugger extends EventEmitter {
    private sessions: Map<string, DebugSession> = new Map();
    private activeSession?: string;
    private debugHistory: Array<{ timestamp: Date; event: string; data: any }> = [];
    
    constructor(private provider: LMStudioProvider) {
        super();
    }
    
    // Start a debug session
    async startSession(type: 'node' | 'python' | 'browser', target: string, args?: string[]): Promise<string> {
        const sessionId = this.generateSessionId();
        const session: DebugSession = {
            id: sessionId,
            type,
            status: 'running',
            breakpoints: [],
            variables: [],
            callStack: []
        };
        
        this.sessions.set(sessionId, session);
        this.activeSession = sessionId;
        
        // Start the appropriate debugger
        switch (type) {
            case 'node':
                await this.startNodeDebugger(sessionId, target, args);
                break;
            case 'python':
                await this.startPythonDebugger(sessionId, target, args);
                break;
            case 'browser':
                await this.startBrowserDebugger(sessionId, target);
                break;
        }
        
        this.emit('sessionStarted', sessionId);
        return sessionId;
    }
    
    // AI-powered debugging analysis
    async analyzeError(error: Error | string, context?: any): Promise<{
        explanation: string;
        possibleCauses: string[];
        solutions: string[];
        codeSnippets: string[];
    }> {
        const errorString = error instanceof Error ? 
            `${error.name}: ${error.message}\nStack: ${error.stack}` : 
            error;
        
        const prompt = `Analyze this error and provide debugging assistance:

Error: ${errorString}
${context ? `\nContext: ${JSON.stringify(context, null, 2)}` : ''}

Provide:
1. Clear explanation of the error
2. Possible causes (numbered list)
3. Solutions to try (numbered list)
4. Code snippets that might fix the issue`;
        
        try {
            const response = await this.provider.chat([
                { 
                    role: 'system', 
                    content: 'You are an expert debugger. Analyze errors and provide clear, actionable debugging assistance.' 
                },
                { role: 'user', content: prompt }
            ]);
            
            return this.parseDebugAnalysis(response.content);
        } catch (error) {
            return {
                explanation: 'Failed to analyze error',
                possibleCauses: [],
                solutions: [],
                codeSnippets: []
            };
        }
    }
    
    // Smart breakpoint suggestions
    async suggestBreakpoints(code: string, issue: string): Promise<BreakpointInfo[]> {
        const prompt = `Given this code and issue, suggest strategic breakpoints for debugging:

Code:
${code}

Issue: ${issue}

Provide breakpoints in format: "line_number: reason"`;
        
        try {
            const response = await this.provider.chat([
                { role: 'system', content: 'You are a debugging expert. Suggest strategic breakpoints.' },
                { role: 'user', content: prompt }
            ]);
            
            return this.parseBreakpointSuggestions(response.content, 'unknown.js');
        } catch {
            return [];
        }
    }
    
    // Variable inspection with AI insights
    async inspectVariable(variable: VariableInfo): Promise<{
        analysis: string;
        potentialIssues: string[];
        recommendations: string[];
    }> {
        const prompt = `Analyze this variable from a debug session:

Name: ${variable.name}
Type: ${variable.type}
Value: ${JSON.stringify(variable.value, null, 2)}
Scope: ${variable.scope}

Provide insights about potential issues and debugging recommendations.`;
        
        try {
            const response = await this.provider.chat([
                { role: 'system', content: 'You are a debugging expert. Analyze variables for potential issues.' },
                { role: 'user', content: prompt }
            ]);
            
            return this.parseVariableAnalysis(response.content);
        } catch {
            return {
                analysis: 'Unable to analyze variable',
                potentialIssues: [],
                recommendations: []
            };
        }
    }
    
    // Step-through debugging with AI guidance
    async getStepRecommendation(session: DebugSession): Promise<{
        action: 'step-in' | 'step-over' | 'step-out' | 'continue';
        reason: string;
        watchVariables: string[];
    }> {
        const context = {
            currentFrame: session.currentFrame,
            variables: session.variables,
            callStack: session.callStack
        };
        
        const prompt = `Given this debug context, recommend the next debugging action:

${JSON.stringify(context, null, 2)}

Recommend: step-in, step-over, step-out, or continue, with reasoning.`;
        
        try {
            const response = await this.provider.chat([
                { role: 'system', content: 'You are a debugging expert. Recommend optimal debugging steps.' },
                { role: 'user', content: prompt }
            ]);
            
            return this.parseStepRecommendation(response.content);
        } catch {
            return {
                action: 'step-over',
                reason: 'Default recommendation',
                watchVariables: []
            };
        }
    }
    
    // Performance profiling integration
    async profileExecution(sessionId: string): Promise<{
        hotspots: Array<{ function: string; time: number; calls: number }>;
        memoryLeaks: Array<{ location: string; size: number; type: string }>;
        recommendations: string[];
    }> {
        // Simulate profiling data collection
        const profilingData = await this.collectProfilingData(sessionId);
        
        // Analyze with AI
        const analysis = await this.analyzePerformance(profilingData);
        
        return analysis;
    }
    
    // Debug history and replay
    async recordDebugEvent(event: string, data: any): Promise<void> {
        this.debugHistory.push({
            timestamp: new Date(),
            event,
            data
        });
        
        // Keep history size manageable
        if (this.debugHistory.length > 1000) {
            this.debugHistory = this.debugHistory.slice(-1000);
        }
        
        this.emit('debugEvent', { event, data });
    }
    
    async replayDebugSession(fromTimestamp: Date): Promise<void> {
        const events = this.debugHistory.filter(e => e.timestamp >= fromTimestamp);
        
        for (const event of events) {
            this.emit('replayEvent', event);
            // Add delay for visualization
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Conditional breakpoints with AI
    async createSmartBreakpoint(
        file: string, 
        line: number, 
        description: string
    ): Promise<BreakpointInfo> {
        const code = await this.getCodeContext(file, line);
        
        const prompt = `Create a conditional breakpoint for this scenario:

Code context:
${code}

Breakpoint at line ${line}
Description: ${description}

Provide a JavaScript condition that should trigger this breakpoint.`;
        
        try {
            const response = await this.provider.chat([
                { role: 'system', content: 'You are a debugging expert. Create smart conditional breakpoints.' },
                { role: 'user', content: prompt }
            ]);
            
            const condition = this.extractCondition(response.content);
            
            return {
                file,
                line,
                condition,
                logMessage: `Smart breakpoint: ${description}`
            };
        } catch {
            return { file, line };
        }
    }
    
    // Helper methods
    private generateSessionId(): string {
        return `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private async startNodeDebugger(sessionId: string, target: string, args?: string[]): Promise<void> {
        // Implementation for Node.js debugger using inspector protocol
        const debugProcess = spawn('node', [
            '--inspect-brk',
            target,
            ...(args || [])
        ]);
        
        debugProcess.stdout.on('data', (data) => {
            this.emit('debugOutput', { sessionId, data: data.toString() });
        });
        
        debugProcess.stderr.on('data', (data) => {
            this.emit('debugError', { sessionId, data: data.toString() });
        });
    }
    
    private async startPythonDebugger(sessionId: string, target: string, args?: string[]): Promise<void> {
        // Implementation for Python debugger using pdb
        const debugProcess = spawn('python', [
            '-m', 'pdb',
            target,
            ...(args || [])
        ]);
        
        // Similar event handling as Node
    }
    
    private async startBrowserDebugger(sessionId: string, url: string): Promise<void> {
        // Implementation for browser debugging using Chrome DevTools Protocol
        // This would connect to Chrome/Edge with remote debugging enabled
    }
    
    private parseDebugAnalysis(response: string): {
        explanation: string;
        possibleCauses: string[];
        solutions: string[];
        codeSnippets: string[];
    } {
        // Parse AI response into structured format
        const sections = response.split(/\n\n/);
        const result = {
            explanation: '',
            possibleCauses: [] as string[],
            solutions: [] as string[],
            codeSnippets: [] as string[]
        };
        
        let currentSection = '';
        for (const section of sections) {
            if (section.toLowerCase().includes('explanation')) {
                currentSection = 'explanation';
            } else if (section.toLowerCase().includes('cause')) {
                currentSection = 'causes';
            } else if (section.toLowerCase().includes('solution')) {
                currentSection = 'solutions';
            } else if (section.toLowerCase().includes('code') || section.includes('```')) {
                currentSection = 'code';
            }
            
            if (currentSection === 'explanation' && !result.explanation) {
                result.explanation = section;
            } else if (currentSection === 'causes') {
                const items = section.match(/\d+\.\s+(.+)/g) || [];
                result.possibleCauses.push(...items.map(item => item.replace(/^\d+\.\s+/, '')));
            } else if (currentSection === 'solutions') {
                const items = section.match(/\d+\.\s+(.+)/g) || [];
                result.solutions.push(...items.map(item => item.replace(/^\d+\.\s+/, '')));
            } else if (section.includes('```')) {
                const code = section.match(/```[\w]*\n([\s\S]*?)```/g) || [];
                result.codeSnippets.push(...code.map(c => c.replace(/```[\w]*\n|```/g, '')));
            }
        }
        
        return result;
    }
    
    private parseBreakpointSuggestions(response: string, file: string): BreakpointInfo[] {
        const breakpoints: BreakpointInfo[] = [];
        const lines = response.split('\n');
        
        for (const line of lines) {
            const match = line.match(/(\d+):\s*(.+)/);
            if (match) {
                breakpoints.push({
                    file,
                    line: parseInt(match[1]),
                    logMessage: match[2]
                });
            }
        }
        
        return breakpoints;
    }
    
    private parseVariableAnalysis(response: string): {
        analysis: string;
        potentialIssues: string[];
        recommendations: string[];
    } {
        // Similar parsing logic as parseDebugAnalysis
        return {
            analysis: response.split('\n\n')[0] || '',
            potentialIssues: this.extractListItems(response, 'issue'),
            recommendations: this.extractListItems(response, 'recommend')
        };
    }
    
    private parseStepRecommendation(response: string): {
        action: 'step-in' | 'step-over' | 'step-out' | 'continue';
        reason: string;
        watchVariables: string[];
    } {
        let action: 'step-in' | 'step-over' | 'step-out' | 'continue' = 'step-over';
        
        if (response.includes('step-in')) action = 'step-in';
        else if (response.includes('step-out')) action = 'step-out';
        else if (response.includes('continue')) action = 'continue';
        
        const reasonMatch = response.match(/reason:?\s*(.+)/i);
        const reason = reasonMatch ? reasonMatch[1] : 'Based on current context';
        
        const watchVars = this.extractListItems(response, 'watch');
        
        return { action, reason, watchVariables: watchVars };
    }
    
    private extractListItems(text: string, keyword: string): string[] {
        const items: string[] = [];
        const lines = text.split('\n');
        
        let inSection = false;
        for (const line of lines) {
            if (line.toLowerCase().includes(keyword)) {
                inSection = true;
            } else if (line.trim() === '') {
                inSection = false;
            } else if (inSection && line.match(/^\s*[-*\d]+\.?\s+/)) {
                items.push(line.replace(/^\s*[-*\d]+\.?\s+/, '').trim());
            }
        }
        
        return items;
    }
    
    private extractCondition(response: string): string {
        // Extract JavaScript condition from response
        const codeMatch = response.match(/`([^`]+)`/);
        if (codeMatch) return codeMatch[1];
        
        // Try to find condition-like patterns
        const conditionMatch = response.match(/condition:?\s*(.+)/i);
        if (conditionMatch) return conditionMatch[1].trim();
        
        return '';
    }
    
    private async getCodeContext(file: string, line: number, contextLines: number = 5): Promise<string> {
        try {
            const content = await fs.readFile(file, 'utf-8');
            const lines = content.split('\n');
            
            const start = Math.max(0, line - contextLines - 1);
            const end = Math.min(lines.length, line + contextLines);
            
            return lines.slice(start, end)
                .map((l, i) => `${start + i + 1}: ${l}`)
                .join('\n');
        } catch {
            return '';
        }
    }
    
    private async collectProfilingData(sessionId: string): Promise<any> {
        // Simulate profiling data collection
        return {
            functions: [
                { name: 'processData', time: 450, calls: 1000 },
                { name: 'calculateResults', time: 230, calls: 500 },
                { name: 'renderUI', time: 120, calls: 60 }
            ],
            memory: [
                { location: 'global.cache', size: 45000000, type: 'Array' },
                { location: 'module.exports.data', size: 12000000, type: 'Object' }
            ]
        };
    }
    
    private async analyzePerformance(data: any): Promise<{
        hotspots: Array<{ function: string; time: number; calls: number }>;
        memoryLeaks: Array<{ location: string; size: number; type: string }>;
        recommendations: string[];
    }> {
        const prompt = `Analyze this performance profiling data and provide recommendations:

${JSON.stringify(data, null, 2)}

Identify hotspots, potential memory leaks, and optimization recommendations.`;
        
        try {
            const response = await this.provider.chat([
                { role: 'system', content: 'You are a performance optimization expert.' },
                { role: 'user', content: prompt }
            ]);
            
            // Parse response
            return {
                hotspots: data.functions.filter((f: any) => f.time > 100),
                memoryLeaks: data.memory.filter((m: any) => m.size > 10000000),
                recommendations: this.extractListItems(response.content, 'recommend')
            };
        } catch {
            return {
                hotspots: [],
                memoryLeaks: [],
                recommendations: ['Failed to analyze performance data']
            };
        }
    }
    
    // Public methods for debugging control
    async stepIn(sessionId?: string): Promise<void> {
        const id = sessionId || this.activeSession;
        if (!id) throw new Error('No active debug session');
        
        // Implementation specific to debugger type
        this.emit('step', { sessionId: id, type: 'in' });
    }
    
    async stepOver(sessionId?: string): Promise<void> {
        const id = sessionId || this.activeSession;
        if (!id) throw new Error('No active debug session');
        
        this.emit('step', { sessionId: id, type: 'over' });
    }
    
    async stepOut(sessionId?: string): Promise<void> {
        const id = sessionId || this.activeSession;
        if (!id) throw new Error('No active debug session');
        
        this.emit('step', { sessionId: id, type: 'out' });
    }
    
    async continue(sessionId?: string): Promise<void> {
        const id = sessionId || this.activeSession;
        if (!id) throw new Error('No active debug session');
        
        const session = this.sessions.get(id);
        if (session) {
            session.status = 'running';
        }
        
        this.emit('continue', { sessionId: id });
    }
    
    async pause(sessionId?: string): Promise<void> {
        const id = sessionId || this.activeSession;
        if (!id) throw new Error('No active debug session');
        
        const session = this.sessions.get(id);
        if (session) {
            session.status = 'paused';
        }
        
        this.emit('pause', { sessionId: id });
    }
    
    async stop(sessionId?: string): Promise<void> {
        const id = sessionId || this.activeSession;
        if (!id) throw new Error('No active debug session');
        
        const session = this.sessions.get(id);
        if (session) {
            session.status = 'stopped';
        }
        
        this.sessions.delete(id);
        if (this.activeSession === id) {
            this.activeSession = undefined;
        }
        
        this.emit('stop', { sessionId: id });
    }
    
    // Get debugging insights
    async getDebuggingInsights(): Promise<{
        commonPatterns: string[];
        bestPractices: string[];
        toolRecommendations: string[];
    }> {
        const recentErrors = this.debugHistory
            .filter(e => e.event === 'error')
            .slice(-10);
        
        const prompt = `Based on these recent debugging sessions, provide insights:

${JSON.stringify(recentErrors, null, 2)}

Provide:
1. Common error patterns
2. Best practices for debugging
3. Tool recommendations`;
        
        try {
            const response = await this.provider.chat([
                { role: 'system', content: 'You are a debugging expert. Provide insights based on debugging history.' },
                { role: 'user', content: prompt }
            ]);
            
            return {
                commonPatterns: this.extractListItems(response.content, 'pattern'),
                bestPractices: this.extractListItems(response.content, 'practice'),
                toolRecommendations: this.extractListItems(response.content, 'tool')
            };
        } catch {
            return {
                commonPatterns: [],
                bestPractices: [],
                toolRecommendations: []
            };
        }
    }
}