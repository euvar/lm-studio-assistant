import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import chalk from 'chalk';
import { agentMetrics } from '../utils/agent-metrics.js';
import { agentObserver } from '../utils/agent-observer.js';

export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();
  private agentPriorities: Map<string, number> = new Map();
  private defaultAgent: string | null = null;
  private readonly MAX_AGENT_CHAIN_LENGTH = 3;

  register(agent: BaseAgent, priority: number = 0): void {
    this.agents.set(agent.name, agent);
    this.agentPriorities.set(agent.name, priority);
    console.log(chalk.dim(`🤖 Registered agent: ${agent.name} (priority: ${priority})`));
  }

  setDefaultAgent(name: string): void {
    if (!this.agents.has(name)) {
      throw new Error(`Agent ${name} not found`);
    }
    this.defaultAgent = name;
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  async findBestAgent(context: AgentContext): Promise<BaseAgent | null> {
    // Check all agents in parallel
    const checks = Array.from(this.agents.values()).map(async (agent) => {
      const canHandle = await agent.canHandle(context);
      agentObserver.observeCanHandle(agent.name, context, canHandle);
      return {
        agent,
        canHandle,
        priority: this.agentPriorities.get(agent.name) || 0
      };
    });

    const results = await Promise.all(checks);
    
    // Filter agents that can handle and sort by priority
    const capableAgents = results
      .filter(r => r.canHandle)
      .sort((a, b) => b.priority - a.priority);
    
    if (capableAgents.length > 0) {
      return capableAgents[0].agent;
    }

    // Return default agent if set
    if (this.defaultAgent) {
      return this.agents.get(this.defaultAgent) || null;
    }

    return null;
  }

  async processWithAgent(agentName: string, context: AgentContext): Promise<AgentResponse> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    const startTime = Date.now();
    let success = true;
    let response: AgentResponse | undefined;
    let toolsUsed: string[] = [];
    
    try {
      // Preprocess
      const processedContext = await agent.preProcess(context);
      agentObserver.observePreProcess(agentName, context, processedContext);
      
      // Process
      const processStart = Date.now();
      response = await agent.process(processedContext);
      const processDuration = Date.now() - processStart;
      agentObserver.observeProcess(agentName, processedContext, response, processDuration);
      
      // Postprocess
      const finalResponse = await agent.postProcess(response, processedContext);
      agentObserver.observePostProcess(agentName, response, finalResponse);
      response = finalResponse;
      
      // Extract tools used
      toolsUsed = response?.toolCalls?.map(tc => tc.tool) || [];
    } catch (error) {
      success = false;
      agentObserver.observeError(agentName, 'process', error as Error);
      throw error;
    } finally {
      const responseTime = Date.now() - startTime;
      agentMetrics.recordCall(agentName, success, responseTime, toolsUsed);
    }
    
    if (!response) {
      throw new Error(`Agent ${agentName} did not return a response`);
    }
    
    return response;
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    const operationId = `op_${Date.now()}`;
    agentObserver.startOperation(operationId);
    
    try {
      const agentChain: string[] = [];
      return await this.processWithChainProtection(context, agentChain);
    } finally {
      if (process.env.DEBUG_AGENTS === 'true') {
        console.log(agentObserver.formatReport(true));
      }
    }
  }

  private async processWithChainProtection(
    context: AgentContext, 
    agentChain: string[]
  ): Promise<AgentResponse> {
    const agent = await this.findBestAgent(context);
    if (!agent) {
      return {
        message: 'No suitable agent found to handle this request'
      };
    }

    // Check for loops
    if (agentChain.includes(agent.name)) {
      console.log(chalk.yellow(`⚠️ Agent loop detected: ${agentChain.join(' -> ')} -> ${agent.name}`));
      return {
        message: 'I encountered a processing loop. Let me provide a direct answer instead.'
      };
    }

    // Check chain length
    if (agentChain.length >= this.MAX_AGENT_CHAIN_LENGTH) {
      console.log(chalk.yellow(`⚠️ Agent chain limit reached: ${agentChain.join(' -> ')}`));
      return {
        message: 'Processing chain is too long. Providing direct response.'
      };
    }

    console.log(chalk.dim(`🤖 Using agent: ${agent.name}`));
    agentChain.push(agent.name);
    
    let response = await this.processWithAgent(agent.name, context);
    
    // If agent provided tool calls, return them immediately
    // Don't switch to another agent if we have actions to perform
    if (response.toolCalls && response.toolCalls.length > 0) {
      return response;
    }
    
    // Handle agent chaining only if no tool calls
    if (response.nextAgent) {
      console.log(chalk.dim(`🔄 Switching to agent: ${response.nextAgent}`));
      const nextContext = {
        ...context,
        metadata: {
          ...context.metadata,
          previousAgent: agent.name,
          previousResponse: response
        }
      };
      response = await this.processWithChainProtection(nextContext, agentChain);
    }

    return response;
  }

  listAgents(): Array<{ name: string; description: string; capabilities: string[]; priority: number }> {
    return Array.from(this.agents.values()).map(agent => ({
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      priority: this.agentPriorities.get(agent.name) || 0
    }));
  }

  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  async executeMultipleAgents(
    tasks: Array<{ agentName: string; context: AgentContext }>,
    parallel: boolean = true
  ): Promise<AgentResponse[]> {
    if (parallel) {
      // Execute all agents in parallel
      const promises = tasks.map(task => 
        this.processWithAgent(task.agentName, task.context)
      );
      return await Promise.all(promises);
    } else {
      // Execute agents sequentially
      const results: AgentResponse[] = [];
      for (const task of tasks) {
        const result = await this.processWithAgent(task.agentName, task.context);
        results.push(result);
      }
      return results;
    }
  }
}