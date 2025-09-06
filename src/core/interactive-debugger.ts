import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RichOutput } from './rich-output.js';
import * as readline from 'readline';
import chalk from 'chalk';

interface Breakpoint {
  id: string;
  file: string;
  line: number;
  condition?: string;
  hitCount: number;
  enabled: boolean;
}

interface StackFrame {
  function: string;
  file: string;
  line: number;
  column: number;
  locals: Record<string, any>;
}

interface Variable {
  name: string;
  value: any;
  type: string;
  expandable: boolean;
  children?: Variable[];
}

interface DebugSession {
  id: string;
  language: string;
  file: string;
  status: 'running' | 'paused' | 'stopped';
  currentLine: number;
  currentColumn: number;
  breakpoints: Map<string, Breakpoint>;
  callStack: StackFrame[];
  variables: Map<string, Variable>;
  output: string[];
  startTime: Date;
}

export class InteractiveDebugger extends EventEmitter {
  private sessions: Map<string, DebugSession> = new Map();
  private richOutput: RichOutput;
  private currentSession: string | null = null;
  private watchExpressions: Map<string, string> = new Map();
  private debugHistory: string[] = [];

  constructor() {
    super();
    this.richOutput = new RichOutput();
  }

  // Start a debug session
  async startDebugSession(file: string, language: string): Promise<string> {
    const sessionId = `debug_${Date.now()}`;
    
    const session: DebugSession = {
      id: sessionId,
      language,
      file,
      status: 'running',
      currentLine: 1,
      currentColumn: 1,
      breakpoints: new Map(),
      callStack: [],
      variables: new Map(),
      output: [],
      startTime: new Date()
    };
    
    this.sessions.set(sessionId, session);
    this.currentSession = sessionId;
    
    this.emit('sessionStarted', session);
    this.displayDebugInterface(session);
    
    return sessionId;
  }

  // Set breakpoint
  setBreakpoint(file: string, line: number, condition?: string): Breakpoint {
    const session = this.getCurrentSession();
    if (!session) throw new Error('No active debug session');
    
    const id = `bp_${Date.now()}`;
    const breakpoint: Breakpoint = {
      id,
      file,
      line,
      condition,
      hitCount: 0,
      enabled: true
    };
    
    session.breakpoints.set(id, breakpoint);
    this.emit('breakpointSet', breakpoint);
    
    return breakpoint;
  }

  // Remove breakpoint
  removeBreakpoint(id: string): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;
    
    const deleted = session.breakpoints.delete(id);
    if (deleted) {
      this.emit('breakpointRemoved', id);
    }
    
    return deleted;
  }

  // Step operations
  async stepOver(): Promise<void> {
    const session = this.getCurrentSession();
    if (!session || session.status !== 'paused') return;
    
    session.currentLine++;
    await this.executeStep(session, 'over');
  }

  async stepInto(): Promise<void> {
    const session = this.getCurrentSession();
    if (!session || session.status !== 'paused') return;
    
    await this.executeStep(session, 'into');
  }

  async stepOut(): Promise<void> {
    const session = this.getCurrentSession();
    if (!session || session.status !== 'paused') return;
    
    await this.executeStep(session, 'out');
  }

  async continue(): Promise<void> {
    const session = this.getCurrentSession();
    if (!session || session.status !== 'paused') return;
    
    session.status = 'running';
    await this.executeUntilBreakpoint(session);
  }

  // Execute step
  private async executeStep(session: DebugSession, type: 'over' | 'into' | 'out') {
    // Simulate step execution
    this.emit('step', { type, line: session.currentLine });
    
    // Update variables
    await this.updateVariables(session);
    
    // Check for breakpoint
    await this.checkBreakpoints(session);
    
    // Update display
    this.displayDebugInterface(session);
  }

  // Execute until breakpoint
  private async executeUntilBreakpoint(session: DebugSession) {
    while (session.status === 'running') {
      session.currentLine++;
      
      // Check if we hit a breakpoint
      for (const bp of session.breakpoints.values()) {
        if (bp.enabled && bp.file === session.file && bp.line === session.currentLine) {
          session.status = 'paused';
          bp.hitCount++;
          
          // Evaluate condition if exists
          if (bp.condition) {
            const conditionMet = await this.evaluateCondition(bp.condition, session);
            if (!conditionMet) {
              session.status = 'running';
              continue;
            }
          }
          
          this.emit('breakpointHit', bp);
          break;
        }
      }
      
      // Simulate execution delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if reached end of file
      const fileContent = await fs.readFile(session.file, 'utf-8');
      const lines = fileContent.split('\n');
      if (session.currentLine >= lines.length) {
        session.status = 'stopped';
        break;
      }
    }
    
    this.displayDebugInterface(session);
  }

  // Evaluate expression
  async evaluate(expression: string): Promise<any> {
    const session = this.getCurrentSession();
    if (!session) throw new Error('No active debug session');
    
    try {
      // In a real debugger, this would evaluate in the current context
      const result = await this.evaluateInContext(expression, session);
      
      // Add to debug history
      this.debugHistory.push(expression);
      
      this.emit('expressionEvaluated', { expression, result });
      return result;
    } catch (error) {
      this.emit('evaluationError', { expression, error });
      throw error;
    }
  }

  // Watch expression
  addWatch(expression: string): string {
    const id = `watch_${Date.now()}`;
    this.watchExpressions.set(id, expression);
    
    this.emit('watchAdded', { id, expression });
    return id;
  }

  removeWatch(id: string): boolean {
    const deleted = this.watchExpressions.delete(id);
    if (deleted) {
      this.emit('watchRemoved', id);
    }
    return deleted;
  }

  // Update variables
  private async updateVariables(session: DebugSession) {
    // Simulate variable inspection
    const frame = session.callStack[0];
    if (!frame) return;
    
    // Example variables
    const variables: Variable[] = [
      {
        name: 'index',
        value: session.currentLine,
        type: 'number',
        expandable: false
      },
      {
        name: 'data',
        value: { items: [], count: 0 },
        type: 'object',
        expandable: true,
        children: [
          {
            name: 'items',
            value: [],
            type: 'array',
            expandable: false
          },
          {
            name: 'count',
            value: 0,
            type: 'number',
            expandable: false
          }
        ]
      }
    ];
    
    session.variables.clear();
    variables.forEach(v => session.variables.set(v.name, v));
  }

  // Check breakpoints
  private async checkBreakpoints(session: DebugSession) {
    for (const bp of session.breakpoints.values()) {
      if (bp.enabled && bp.file === session.file && bp.line === session.currentLine) {
        session.status = 'paused';
        bp.hitCount++;
        
        this.emit('breakpointHit', bp);
        break;
      }
    }
  }

  // Evaluate condition
  private async evaluateCondition(condition: string, session: DebugSession): Promise<boolean> {
    try {
      const result = await this.evaluateInContext(condition, session);
      return !!result;
    } catch {
      return false;
    }
  }

  // Evaluate in context
  private async evaluateInContext(expression: string, session: DebugSession): Promise<any> {
    // Build context from variables
    const context: Record<string, any> = {};
    for (const [name, variable] of session.variables) {
      context[name] = variable.value;
    }
    
    // Simple evaluation (in production, use a proper sandbox)
    try {
      const func = new Function(...Object.keys(context), `return ${expression}`);
      return func(...Object.values(context));
    } catch (error) {
      throw new Error(`Failed to evaluate: ${expression}`);
    }
  }

  // Display debug interface
  private displayDebugInterface(session: DebugSession) {
    console.clear();
    this.richOutput.title('Interactive Debugger', 'box');
    
    // Status bar
    const statusColor = session.status === 'running' ? 'green' : 
                       session.status === 'paused' ? 'yellow' : 'red';
    console.log(chalk[statusColor](`Status: ${session.status.toUpperCase()}`));
    console.log(chalk.gray(`File: ${session.file}`));
    console.log(chalk.gray(`Line: ${session.currentLine}`));
    
    this.richOutput.separator();
    
    // Code view with current line highlighted
    this.displayCodeView(session);
    
    // Variables
    this.richOutput.subtitle('Variables');
    this.displayVariables(session);
    
    // Call stack
    this.richOutput.subtitle('Call Stack');
    this.displayCallStack(session);
    
    // Breakpoints
    this.richOutput.subtitle('Breakpoints');
    this.displayBreakpoints(session);
    
    // Watch expressions
    if (this.watchExpressions.size > 0) {
      this.richOutput.subtitle('Watch');
      this.displayWatchExpressions(session);
    }
    
    // Debug console
    this.richOutput.subtitle('Debug Console');
    this.displayOutput(session);
    
    // Commands
    this.displayCommands();
  }

  // Display code view
  private async displayCodeView(session: DebugSession) {
    try {
      const content = await fs.readFile(session.file, 'utf-8');
      const lines = content.split('\n');
      
      const start = Math.max(0, session.currentLine - 5);
      const end = Math.min(lines.length, session.currentLine + 5);
      
      for (let i = start; i < end; i++) {
        const lineNum = i + 1;
        const isCurrentLine = lineNum === session.currentLine;
        const hasBreakpoint = Array.from(session.breakpoints.values())
          .some(bp => bp.file === session.file && bp.line === lineNum);
        
        let prefix = chalk.gray(`${lineNum.toString().padStart(4)} │ `);
        
        if (isCurrentLine) {
          prefix = chalk.yellow('→ ') + chalk.yellow(`${lineNum.toString().padStart(2)} │ `);
        }
        
        if (hasBreakpoint) {
          prefix = chalk.red('● ') + prefix.substring(2);
        }
        
        const line = lines[i] || '';
        console.log(prefix + (isCurrentLine ? chalk.yellow(line) : line));
      }
    } catch (error) {
      console.log(chalk.red('Failed to load source file'));
    }
  }

  // Display variables
  private displayVariables(session: DebugSession) {
    if (session.variables.size === 0) {
      console.log(chalk.gray('  No variables in scope'));
      return;
    }
    
    for (const [name, variable] of session.variables) {
      this.displayVariable(variable, 0);
    }
  }

  private displayVariable(variable: Variable, indent: number) {
    const prefix = '  '.repeat(indent);
    const typeColor = variable.type === 'string' ? 'green' :
                     variable.type === 'number' ? 'yellow' :
                     variable.type === 'boolean' ? 'cyan' : 'white';
    
    let valueStr = JSON.stringify(variable.value);
    if (valueStr.length > 50) {
      valueStr = valueStr.substring(0, 50) + '...';
    }
    
    console.log(
      prefix + 
      chalk.white(variable.name) + ': ' +
      chalk[typeColor](valueStr) + 
      chalk.gray(` (${variable.type})`)
    );
    
    if (variable.expandable && variable.children) {
      for (const child of variable.children) {
        this.displayVariable(child, indent + 1);
      }
    }
  }

  // Display call stack
  private displayCallStack(session: DebugSession) {
    if (session.callStack.length === 0) {
      console.log(chalk.gray('  No call stack'));
      return;
    }
    
    session.callStack.forEach((frame, index) => {
      const current = index === 0 ? chalk.yellow('→ ') : '  ';
      console.log(
        current + 
        chalk.white(frame.function) + 
        chalk.gray(` at ${frame.file}:${frame.line}:${frame.column}`)
      );
    });
  }

  // Display breakpoints
  private displayBreakpoints(session: DebugSession) {
    if (session.breakpoints.size === 0) {
      console.log(chalk.gray('  No breakpoints set'));
      return;
    }
    
    for (const bp of session.breakpoints.values()) {
      const status = bp.enabled ? chalk.green('●') : chalk.gray('○');
      const condition = bp.condition ? chalk.gray(` [${bp.condition}]`) : '';
      const hits = bp.hitCount > 0 ? chalk.gray(` (hits: ${bp.hitCount})`) : '';
      
      console.log(
        `  ${status} ${bp.file}:${bp.line}${condition}${hits}`
      );
    }
  }

  // Display watch expressions
  private async displayWatchExpressions(session: DebugSession) {
    for (const [id, expression] of this.watchExpressions) {
      try {
        const value = await this.evaluateInContext(expression, session);
        console.log(`  ${chalk.white(expression)}: ${chalk.green(JSON.stringify(value))}`);
      } catch (error) {
        console.log(`  ${chalk.white(expression)}: ${chalk.red('Error')}`);
      }
    }
  }

  // Display output
  private displayOutput(session: DebugSession) {
    if (session.output.length === 0) {
      console.log(chalk.gray('  No output'));
      return;
    }
    
    const recent = session.output.slice(-5);
    for (const line of recent) {
      console.log(chalk.gray('  > ') + line);
    }
  }

  // Display commands
  private displayCommands() {
    this.richOutput.separator();
    console.log(chalk.gray('Commands: ') + 
      chalk.cyan('(s)tep over, (i)nto, (o)ut, (c)ontinue, (b)reakpoint, (w)atch, (e)val, (q)uit'));
  }

  // Get current session
  private getCurrentSession(): DebugSession | null {
    if (!this.currentSession) return null;
    return this.sessions.get(this.currentSession) || null;
  }

  // Interactive REPL
  async startREPL() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('debug> ')
    });

    rl.on('line', async (input) => {
      const args = input.trim().split(' ');
      const command = args[0];

      try {
        switch (command) {
          case 's':
          case 'step':
            await this.stepOver();
            break;
          
          case 'i':
          case 'into':
            await this.stepInto();
            break;
          
          case 'o':
          case 'out':
            await this.stepOut();
            break;
          
          case 'c':
          case 'continue':
            await this.continue();
            break;
          
          case 'b':
          case 'breakpoint':
            if (args.length >= 3) {
              const file = args[1];
              const line = parseInt(args[2]);
              const condition = args.slice(3).join(' ');
              this.setBreakpoint(file, line, condition);
              console.log(chalk.green(`Breakpoint set at ${file}:${line}`));
            }
            break;
          
          case 'w':
          case 'watch':
            if (args.length >= 2) {
              const expression = args.slice(1).join(' ');
              const id = this.addWatch(expression);
              console.log(chalk.green(`Watch added: ${id}`));
            }
            break;
          
          case 'e':
          case 'eval':
            if (args.length >= 2) {
              const expression = args.slice(1).join(' ');
              const result = await this.evaluate(expression);
              console.log(chalk.green(JSON.stringify(result, null, 2)));
            }
            break;
          
          case 'q':
          case 'quit':
            rl.close();
            return;
          
          default:
            if (input.trim()) {
              // Treat as expression to evaluate
              const result = await this.evaluate(input);
              console.log(chalk.green(JSON.stringify(result, null, 2)));
            }
        }
      } catch (error: any) {
        console.log(chalk.red(`Error: ${error.message}`));
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log(chalk.yellow('\nDebug session ended'));
      process.exit(0);
    });

    rl.prompt();
  }

  // Export debug session
  async exportSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    const exportData = {
      session: {
        id: session.id,
        file: session.file,
        language: session.language,
        startTime: session.startTime,
        duration: Date.now() - session.startTime.getTime()
      },
      breakpoints: Array.from(session.breakpoints.values()),
      variables: Array.from(session.variables.entries()),
      callStack: session.callStack,
      output: session.output,
      watchExpressions: Array.from(this.watchExpressions.entries())
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}