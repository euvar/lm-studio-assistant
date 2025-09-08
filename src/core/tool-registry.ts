import { 
  ToolDefinition, 
  ToolExecutor, 
  ToolProvider,
  ToolCall,
  ToolResult
} from '../types/tool-definitions.js';
import chalk from 'chalk';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();
  private providers: Map<string, ToolProvider> = new Map();

  /**
   * Register a single tool definition with optional executor
   */
  register(tool: ToolDefinition, executor?: ToolExecutor): void {
    if (this.tools.has(tool.name)) {
      console.warn(chalk.yellow(`Tool '${tool.name}' is already registered. Overwriting...`));
    }

    this.tools.set(tool.name, tool);
    
    if (executor) {
      this.executors.set(tool.name, executor);
    }
  }

  /**
   * Register a tool provider that provides multiple tools
   */
  registerProvider(providerName: string, provider: ToolProvider): void {
    this.providers.set(providerName, provider);
    
    // Register all tools from the provider
    const tools = provider.getToolDefinitions();
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
      
      // Also register executors if provider supplies them
      const executor = provider.getToolExecutor(tool.name);
      if (executor) {
        this.executors.set(tool.name, executor);
      }
    }
  }

  /**
   * Get all registered tools
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tools filtered by capability or tag
   */
  getToolsByCapability(capability: string): ToolDefinition[] {
    return this.getTools().filter(tool => 
      tool.description.toLowerCase().includes(capability.toLowerCase())
    );
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: ToolCall, context?: any): Promise<ToolResult> {
    const executor = this.executors.get(toolCall.tool);
    
    if (!executor) {
      return {
        toolCallId: toolCall.id,
        result: null,
        error: `No executor found for tool: ${toolCall.tool}`,
        isError: true
      };
    }

    try {
      const result = await executor.execute(toolCall.parameters, context);
      return {
        toolCallId: toolCall.id,
        ...result
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        isError: true
      };
    }
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.executors.clear();
    this.providers.clear();
  }

  /**
   * Get tool definitions in OpenAI format
   */
  getToolsInOpenAIFormat(): any[] {
    return this.getTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  /**
   * Get tool definitions in Anthropic format
   */
  getToolsInAnthropicFormat(): any[] {
    return this.getTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }

  /**
   * Validate tool parameters against definition
   */
  validateToolCall(toolCall: ToolCall): { valid: boolean; errors: string[] } {
    const tool = this.getTool(toolCall.tool);
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool '${toolCall.tool}' not found`]
      };
    }

    const errors: string[] = [];
    const { properties, required = [] } = tool.parameters;

    // Check required parameters
    for (const reqParam of required) {
      if (!(reqParam in toolCall.parameters)) {
        errors.push(`Missing required parameter: ${reqParam}`);
      }
    }

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(toolCall.parameters)) {
      const paramDef = properties[paramName];
      if (!paramDef) {
        errors.push(`Unknown parameter: ${paramName}`);
        continue;
      }

      // Basic type validation
      const actualType = Array.isArray(paramValue) ? 'array' : typeof paramValue;
      if (paramDef.type !== actualType && paramDef.type !== 'object') {
        errors.push(`Parameter '${paramName}' should be ${paramDef.type} but got ${actualType}`);
      }

      // Enum validation
      if (paramDef.enum && !paramDef.enum.includes(String(paramValue))) {
        errors.push(`Parameter '${paramName}' should be one of: ${paramDef.enum.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();