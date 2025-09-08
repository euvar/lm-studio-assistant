/**
 * Tool Definition Types for LLM Tool Use
 * Based on OpenAI and Anthropic function calling standards
 */

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  required?: boolean;
  default?: any;
  items?: ToolParameter; // For array types
  properties?: Record<string, ToolParameter>; // For object types
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  examples?: ToolExample[];
}

export interface ToolExample {
  input: string;
  expectedCall: ToolCall;
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
  id?: string;
}

export interface ToolResult {
  toolCallId?: string;
  result: any;
  error?: string;
  isError?: boolean;
}

export interface ToolCallRequest {
  userInput: string;
  availableTools: ToolDefinition[];
  context?: {
    previousCalls?: ToolCall[];
    conversationHistory?: any[];
    metadata?: Record<string, any>;
  };
}

export interface ToolCallResponse {
  toolCalls: ToolCall[];
  reasoning?: string;
  confidence?: number;
}

export interface ToolExecutor {
  name: string;
  execute(parameters: Record<string, any>, context?: any): Promise<ToolResult>;
}

export interface ToolProvider {
  getToolDefinitions(): ToolDefinition[];
  getToolExecutor(toolName: string): ToolExecutor | undefined;
}