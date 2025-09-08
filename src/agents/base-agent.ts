import { ChatMessage } from '../providers/lmstudio.js';
import { ToolDefinition, ToolProvider, ToolExecutor, ToolCall } from '../types/tool-definitions.js';

export interface AgentContext {
  userInput: string;
  conversationHistory: ChatMessage[];
  availableTools: string[];
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  message?: string;
  toolCalls?: Array<{
    tool: string;
    parameters: any;
  }>;
  metadata?: Record<string, any>;
  nextAgent?: string; // Can suggest another agent to handle
  skipOtherAgents?: boolean; // If true, don't process with other agents
}

export abstract class BaseAgent implements ToolProvider {
  abstract name: string;
  abstract description: string;
  abstract capabilities: string[];

  // Check if this agent can handle the request
  abstract canHandle(context: AgentContext): Promise<boolean>;
  
  // Process the request
  abstract process(context: AgentContext): Promise<AgentResponse>;
  
  // Optional: preprocessing hook
  async preProcess(context: AgentContext): Promise<AgentContext> {
    return context;
  }
  
  // Optional: postprocessing hook  
  async postProcess(response: AgentResponse, context: AgentContext): Promise<AgentResponse> {
    return response;
  }

  // New methods for tool-based approach
  /**
   * Get tool definitions provided by this agent
   */
  getToolDefinitions(): ToolDefinition[] {
    // Default implementation returns empty array
    // Subclasses should override this
    return [];
  }

  /**
   * Get executor for a specific tool
   */
  getToolExecutor(toolName: string): ToolExecutor | undefined {
    // Default implementation returns undefined
    // Subclasses should override this
    return undefined;
  }

  /**
   * Execute a tool call directly
   */
  async executeTool(toolCall: ToolCall): Promise<any> {
    const executor = this.getToolExecutor(toolCall.tool);
    if (!executor) {
      throw new Error(`No executor found for tool: ${toolCall.tool}`);
    }
    return executor.execute(toolCall.parameters);
  }
}