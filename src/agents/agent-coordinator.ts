import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { AgentRegistry } from './agent-registry.js';
import chalk from 'chalk';

export interface AgentPlan {
  steps: Array<{
    agentName: string;
    description: string;
    dependencies?: number[]; // Indices of steps that must complete first
    parallel?: boolean; // Can run in parallel with dependencies
  }>;
}

export interface AgentResult {
  agentName: string;
  success: boolean;
  response: AgentResponse;
  duration: number;
}

export class AgentCoordinator {
  constructor(private registry: AgentRegistry) {}
  
  async executeComplexTask(
    task: string,
    context: AgentContext,
    plan?: AgentPlan
  ): Promise<AgentResult[]> {
    // If no plan provided, create one
    if (!plan) {
      plan = await this.createExecutionPlan(task, context);
    }
    
    console.log(chalk.dim('📋 Execution plan:'));
    plan.steps.forEach((step, i) => {
      console.log(chalk.dim(`  ${i + 1}. ${step.agentName}: ${step.description}`));
    });
    
    const results: AgentResult[] = [];
    const completed = new Set<number>();
    
    // Execute steps respecting dependencies
    while (completed.size < plan.steps.length) {
      const readySteps = this.getReadySteps(plan, completed);
      
      if (readySteps.length === 0) {
        throw new Error('Circular dependency in execution plan');
      }
      
      // Execute ready steps (in parallel if possible)
      const stepPromises = readySteps.map(async (stepIndex) => {
        const step = plan.steps[stepIndex];
        const startTime = Date.now();
        
        console.log(chalk.dim(`🤖 Executing: ${step.agentName}`));
        
        try {
          // Create context with results from previous steps
          const enrichedContext = this.enrichContext(context, results, step);
          
          const response = await this.registry.processWithAgent(
            step.agentName,
            enrichedContext
          );
          
          const result: AgentResult = {
            agentName: step.agentName,
            success: true,
            response,
            duration: Date.now() - startTime
          };
          
          results.push(result);
          completed.add(stepIndex);
          
          console.log(chalk.green(`✓ ${step.agentName} completed (${result.duration}ms)`));
          
          return result;
        } catch (error) {
          const result: AgentResult = {
            agentName: step.agentName,
            success: false,
            response: { 
              message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
            },
            duration: Date.now() - startTime
          };
          
          results.push(result);
          completed.add(stepIndex);
          
          console.log(chalk.red(`✗ ${step.agentName} failed`));
          
          return result;
        }
      });
      
      await Promise.all(stepPromises);
    }
    
    return results;
  }
  
  private async createExecutionPlan(
    task: string,
    context: AgentContext
  ): Promise<AgentPlan> {
    // Simple plan generation - can be enhanced with AI
    const steps = [];
    
    // Analyze task to determine needed agents
    const taskLower = task.toLowerCase();
    
    if (/создай.*проект|create.*project/i.test(taskLower)) {
      steps.push(
        { agentName: 'file-operations', description: 'Create project structure' },
        { agentName: 'code-execution', description: 'Generate code files', dependencies: [0] },
        { agentName: 'smart-project', description: 'Analyze created project', dependencies: [1] }
      );
    } else if (/найди.*исправь|find.*fix/i.test(taskLower)) {
      steps.push(
        { agentName: 'code-execution', description: 'Identify errors' },
        { agentName: 'file-operations', description: 'Read error files', dependencies: [0], parallel: true },
        { agentName: 'code-execution', description: 'Fix errors', dependencies: [1] }
      );
    } else {
      // Default: single agent
      const agent = await this.registry.findBestAgent(context);
      if (agent) {
        steps.push({ agentName: agent.name, description: task });
      }
    }
    
    return { steps };
  }
  
  private getReadySteps(plan: AgentPlan, completed: Set<number>): number[] {
    const ready: number[] = [];
    
    plan.steps.forEach((step, index) => {
      if (completed.has(index)) return; // Already done
      
      // Check if all dependencies are completed
      const depsCompleted = !step.dependencies || 
        step.dependencies.every(dep => completed.has(dep));
      
      if (depsCompleted) {
        ready.push(index);
      }
    });
    
    return ready;
  }
  
  private enrichContext(
    baseContext: AgentContext,
    previousResults: AgentResult[],
    currentStep: any
  ): AgentContext {
    // Add results from previous steps to context
    const enriched = { ...baseContext };
    
    enriched.metadata = {
      ...enriched.metadata,
      previousResults: previousResults.map(r => ({
        agent: r.agentName,
        success: r.success,
        output: r.response.message || r.response.toolCalls
      })),
      currentStep: currentStep.description
    };
    
    return enriched;
  }
  
  async delegateToSpecialist(
    context: AgentContext,
    preferredAgent?: string
  ): Promise<AgentResponse> {
    let agent;
    
    if (preferredAgent) {
      agent = this.registry.getAgent(preferredAgent);
    }
    
    if (!agent) {
      agent = await this.registry.findBestAgent(context);
    }
    
    if (!agent) {
      return { message: 'No suitable agent found for this task' };
    }
    
    console.log(chalk.dim(`🎯 Delegating to: ${agent.name}`));
    
    return await this.registry.processWithAgent(agent.name, context);
  }
}