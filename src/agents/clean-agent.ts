/**
 * Clean Agent Implementation
 * No hardcoded patterns - pure tool definitions
 */

import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { ToolDefinition, ToolExecutor as IToolExecutor } from '../types/tool-definitions.js';

/**
 * Base class for clean agents that only define tools
 * No pattern matching, no constants
 */
export abstract class CleanAgent extends BaseAgent {
  /**
   * Agents should not implement canHandle with patterns
   * The orchestrator decides based on tool definitions
   */
  async canHandle(context: AgentContext): Promise<boolean> {
    // Only handle if explicitly selected by orchestrator
    if (context.metadata?.selectedAgent === this.name) {
      return true;
    }
    return false;
  }

  /**
   * Process based on tool call from orchestrator
   */
  async process(context: AgentContext): Promise<AgentResponse> {
    const toolCall = context.metadata?.toolCall;
    if (!toolCall) {
      return { message: 'No tool call specified' };
    }

    const executor = this.getToolExecutor(toolCall.name);
    if (!executor) {
      return { message: `Unknown tool: ${toolCall.name}` };
    }

    try {
      const result = await executor.execute(toolCall.arguments || {});
      return result.result || result;
    } catch (error) {
      return {
        message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}