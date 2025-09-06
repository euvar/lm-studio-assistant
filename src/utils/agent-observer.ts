import chalk from 'chalk';
import { AgentContext, AgentResponse } from '../agents/base-agent.js';

export interface AgentObservation {
  timestamp: Date;
  agentName: string;
  phase: 'canHandle' | 'preProcess' | 'process' | 'postProcess';
  input?: AgentContext;
  output?: any;
  duration?: number;
  decision?: boolean;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface ObservationReport {
  totalAgents: number;
  agentsChecked: number;
  selectedAgent: string | null;
  totalDuration: number;
  observations: AgentObservation[];
  toolsExecuted: string[];
  errors: Error[];
}

export class AgentObserver {
  private observations: AgentObservation[] = [];
  private currentOperation: string | null = null;
  private operationStartTime: number = 0;
  private enabled: boolean = false;

  enable(): void {
    this.enabled = true;
    console.log(chalk.dim('🔍 Agent observation enabled'));
  }

  disable(): void {
    this.enabled = false;
  }

  startOperation(operationId: string): void {
    if (!this.enabled) return;
    this.currentOperation = operationId;
    this.operationStartTime = Date.now();
    this.observations = [];
  }

  observeCanHandle(agentName: string, context: AgentContext, decision: boolean): void {
    if (!this.enabled || !this.currentOperation) return;

    this.observations.push({
      timestamp: new Date(),
      agentName,
      phase: 'canHandle',
      input: this.sanitizeContext(context),
      decision,
      duration: Date.now() - this.operationStartTime
    });

    if (process.env.DEBUG === 'true') {
      console.log(chalk.dim(`  [canHandle] ${agentName}: ${decision ? '✓' : '✗'}`));
    }
  }

  observePreProcess(agentName: string, input: AgentContext, output: AgentContext): void {
    if (!this.enabled || !this.currentOperation) return;

    this.observations.push({
      timestamp: new Date(),
      agentName,
      phase: 'preProcess',
      input: this.sanitizeContext(input),
      output: this.sanitizeContext(output),
      duration: Date.now() - this.operationStartTime
    });
  }

  observeProcess(agentName: string, context: AgentContext, response: AgentResponse, duration: number): void {
    if (!this.enabled || !this.currentOperation) return;

    this.observations.push({
      timestamp: new Date(),
      agentName,
      phase: 'process',
      input: this.sanitizeContext(context),
      output: response,
      duration,
      metadata: {
        hasToolCalls: !!response.toolCalls?.length,
        toolCount: response.toolCalls?.length || 0,
        hasMessage: !!response.message,
        nextAgent: response.nextAgent
      }
    });
  }

  observePostProcess(agentName: string, input: AgentResponse, output: AgentResponse): void {
    if (!this.enabled || !this.currentOperation) return;

    this.observations.push({
      timestamp: new Date(),
      agentName,
      phase: 'postProcess',
      input: input as any, // PostProcess uses AgentResponse not AgentContext
      output: output as any,
      duration: Date.now() - this.operationStartTime
    });
  }

  observeError(agentName: string, phase: string, error: Error): void {
    if (!this.enabled || !this.currentOperation) return;

    this.observations.push({
      timestamp: new Date(),
      agentName,
      phase: phase as any,
      error,
      duration: Date.now() - this.operationStartTime
    });

    console.error(chalk.red(`  [ERROR] ${agentName}.${phase}: ${error.message}`));
  }

  generateReport(): ObservationReport {
    const agentsChecked = new Set(this.observations.filter(o => o.phase === 'canHandle').map(o => o.agentName));
    const selectedAgent = this.observations.find(o => o.phase === 'process')?.agentName || null;
    const toolsExecuted: string[] = [];
    const errors: Error[] = [];

    this.observations.forEach(obs => {
      if (obs.error) errors.push(obs.error);
      if (obs.phase === 'process' && obs.output?.toolCalls) {
        obs.output.toolCalls.forEach((tc: any) => toolsExecuted.push(tc.tool));
      }
    });

    const totalDuration = Date.now() - this.operationStartTime;

    return {
      totalAgents: agentsChecked.size,
      agentsChecked: agentsChecked.size,
      selectedAgent,
      totalDuration,
      observations: this.observations,
      toolsExecuted,
      errors
    };
  }

  formatReport(detailed: boolean = false): string {
    const report = this.generateReport();
    const lines: string[] = [];

    lines.push(chalk.bold('\n📊 Agent Execution Report'));
    lines.push(chalk.dim('─'.repeat(50)));
    
    lines.push(`Total Duration: ${report.totalDuration}ms`);
    lines.push(`Agents Checked: ${report.agentsChecked}`);
    lines.push(`Selected Agent: ${report.selectedAgent || 'none'}`);
    
    if (report.toolsExecuted.length > 0) {
      lines.push(`Tools Executed: ${report.toolsExecuted.join(', ')}`);
    }
    
    if (report.errors.length > 0) {
      lines.push(chalk.red(`Errors: ${report.errors.length}`));
      report.errors.forEach(err => {
        lines.push(chalk.red(`  - ${err.message}`));
      });
    }

    if (detailed) {
      lines.push(chalk.dim('\nDetailed Flow:'));
      
      // Group by agent
      const byAgent = new Map<string, AgentObservation[]>();
      report.observations.forEach(obs => {
        const list = byAgent.get(obs.agentName) || [];
        list.push(obs);
        byAgent.set(obs.agentName, list);
      });

      byAgent.forEach((observations, agentName) => {
        lines.push(chalk.cyan(`\n${agentName}:`));
        observations.forEach(obs => {
          const symbol = obs.decision ? '✓' : obs.error ? '✗' : '•';
          const time = `+${obs.duration}ms`;
          lines.push(`  ${symbol} ${obs.phase} ${chalk.dim(time)}`);
          
          if (obs.error) {
            lines.push(chalk.red(`    Error: ${obs.error.message}`));
          }
          
          if (obs.phase === 'process' && obs.metadata) {
            if (obs.metadata.toolCount > 0) {
              lines.push(`    Tools: ${obs.metadata.toolCount}`);
            }
            if (obs.metadata.nextAgent) {
              lines.push(`    Next: ${obs.metadata.nextAgent}`);
            }
          }
        });
      });
    }

    return lines.join('\n');
  }

  reset(): void {
    this.observations = [];
    this.currentOperation = null;
    this.operationStartTime = 0;
  }

  private sanitizeContext(context: AgentContext): any {
    // Remove large data to keep observations lightweight
    return {
      userInput: context.userInput,
      hasHistory: context.conversationHistory.length > 0,
      historyLength: context.conversationHistory.length,
      availableTools: context.availableTools?.length || 0,
      hasMetadata: !!context.metadata
    };
  }
}

// Global instance
export const agentObserver = new AgentObserver();