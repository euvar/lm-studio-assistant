import { ChatMessage } from '../providers/lmstudio.js';

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

export abstract class BaseAgent {
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
}