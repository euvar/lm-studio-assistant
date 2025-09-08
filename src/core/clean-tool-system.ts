/**
 * Clean Tool Use Implementation
 * Following OpenAI/Anthropic standards - NO hardcoded strings
 */

import { LMStudioProvider, ChatMessage } from '../providers/lmstudio.js';
import { ToolDefinition } from '../types/tool-definitions.js';

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result: any;
}

/**
 * Clean tool calling implementation
 * The LLM decides when to use tools based on their descriptions
 */
export class CleanToolCaller {
  constructor(private provider: LMStudioProvider) {}

  /**
   * Let the LLM decide which tools to use
   */
  async callWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[]
  ): Promise<{
    message?: string;
    toolCalls?: ToolCall[];
  }> {
    // Format tools for LLM
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You have access to the following tools:

${JSON.stringify(tools, null, 2)}

When you need to use a tool, respond with:
{
  "toolCalls": [
    {
      "name": "tool_name",
      "arguments": { "arg1": "value1" }
    }
  ]
}

When you have a direct answer, respond with:
{
  "message": "Your response"
}`
    };

    // Add system message to conversation
    const fullMessages = [systemMessage, ...messages];

    // Get LLM response
    const response = await this.provider.chat(fullMessages, 0.1);

    try {
      // Parse structured response
      const parsed = JSON.parse(response.content);
      return {
        message: parsed.message,
        toolCalls: parsed.toolCalls
      };
    } catch {
      // Fallback to plain text
      return { message: response.content };
    }
  }
}

/**
 * Tool executor - executes tool calls
 */
export class ToolExecutor {
  private handlers: Map<string, (args: any) => Promise<any>> = new Map();

  register(name: string, handler: (args: any) => Promise<any>): void {
    this.handlers.set(name, handler);
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const handler = this.handlers.get(toolCall.name);
    if (!handler) {
      throw new Error(`No handler for tool: ${toolCall.name}`);
    }

    const result = await handler(toolCall.arguments);
    return {
      name: toolCall.name,
      result
    };
  }
}