/**
 * Clean Orchestrator - Uses LLM tool calling
 * No patterns, no constants
 */

import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { LMStudioProvider, ChatMessage } from '../providers/lmstudio.js';
import { AgentRegistry } from './agent-registry.js';
import { CleanToolCaller } from '../core/clean-tool-system.js';
import { ToolDefinition } from '../types/tool-definitions.js';
import chalk from 'chalk';

export class CleanOrchestrator extends BaseAgent {
  name = 'clean-orchestrator';
  description = 'Orchestrates agents using LLM tool calling';
  capabilities = ['orchestration'];
  
  private toolCaller: CleanToolCaller;

  constructor(
    private provider: LMStudioProvider,
    private agentRegistry: AgentRegistry
  ) {
    super();
    this.toolCaller = new CleanToolCaller(provider);
  }

  /**
   * Orchestrator handles all requests
   */
  async canHandle(context: AgentContext): Promise<boolean> {
    return true;
  }

  /**
   * Let LLM decide which tools to use
   */
  async process(context: AgentContext): Promise<AgentResponse> {
    // Collect all tool definitions from agents
    const tools = this.collectToolDefinitions();
    
    if (tools.length === 0) {
      return { message: 'No tools available' };
    }

    // Convert conversation to messages
    const messages: ChatMessage[] = [
      ...context.conversationHistory,
      { role: 'user', content: context.userInput }
    ];

    // Let LLM decide which tools to use
    const response = await this.toolCaller.callWithTools(messages, tools);

    // If LLM provided a direct answer
    if (response.message && !response.toolCalls) {
      return { message: response.message };
    }

    // Execute tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      const results = [];
      
      for (const toolCall of response.toolCalls) {
        console.log(chalk.green(`Calling tool: ${toolCall.name}`));
        
        // Find agent that provides this tool
        const agent = this.findAgentForTool(toolCall.name);
        
        if (agent) {
          // Execute through agent
          const agentContext: AgentContext = {
            ...context,
            metadata: {
              selectedAgent: agent.name,
              toolCall: toolCall
            }
          };
          
          const result = await agent.process(agentContext);
          results.push(result);
        } else {
          console.warn(chalk.yellow(`No agent found for tool: ${toolCall.name}`));
        }
      }

      // Combine results
      return this.combineResults(results);
    }

    return { message: 'Unable to process request' };
  }

  /**
   * Collect all tool definitions from registered agents
   */
  private collectToolDefinitions(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    const agents = this.agentRegistry.getAllAgents();

    for (const agent of agents) {
      if (agent.name === this.name) continue; // Skip self
      
      const agentTools = agent.getToolDefinitions();
      tools.push(...agentTools);
    }

    return tools;
  }

  /**
   * Find which agent provides a specific tool
   */
  private findAgentForTool(toolName: string): BaseAgent | undefined {
    const agents = this.agentRegistry.getAllAgents();
    
    for (const agent of agents) {
      if (agent.name === this.name) continue;
      
      const tools = agent.getToolDefinitions();
      if (tools.some((t: ToolDefinition) => t.name === toolName)) {
        return agent;
      }
    }
    
    return undefined;
  }

  /**
   * Combine results from multiple agents
   */
  private combineResults(results: AgentResponse[]): AgentResponse {
    const combined: AgentResponse = {
      toolCalls: []
    };

    for (const result of results) {
      if (result.toolCalls) {
        combined.toolCalls!.push(...result.toolCalls);
      }
      if (result.message) {
        combined.message = (combined.message || '') + '\n' + result.message;
      }
    }

    return combined;
  }

  /**
   * Orchestrator doesn't provide tools
   */
  getToolDefinitions(): ToolDefinition[] {
    return [];
  }
}