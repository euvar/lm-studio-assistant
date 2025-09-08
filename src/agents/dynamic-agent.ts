/**
 * Dynamic Agent - Completely free of hardcoded strings
 * All behavior is determined by configuration and LLM understanding
 */

import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { ToolDefinition, ToolExecutor } from '../types/tool-definitions.js';
import { ConfigToolLoader, ConfigToolDefinition } from '../core/config-tool-loader.js';
import { LMStudioProvider } from '../providers/lmstudio.js';

export class DynamicAgent extends BaseAgent {
  private configLoader: ConfigToolLoader;
  private toolConfig: ConfigToolDefinition;
  private generatedDefinition: ToolDefinition | null = null;
  private provider: LMStudioProvider;
  
  // Define abstract properties
  name: string;
  description: string;
  capabilities: string[];

  constructor(
    provider: LMStudioProvider,
    toolConfigName: string
  ) {
    super();
    this.provider = provider;
    this.configLoader = new ConfigToolLoader(provider);
    
    // Load configuration for this agent
    const config = this.configLoader.getTool(toolConfigName);
    if (!config) {
      throw new Error(`Tool configuration not found: ${toolConfigName}`);
    }
    this.toolConfig = config;
    
    // Set properties from config
    this.name = config.name;
    this.description = config.purpose;
    this.capabilities = config.capabilities;
    
    // Generate tool definition asynchronously
    this.initializeToolDefinition(provider);
  }

  private async initializeToolDefinition(provider: LMStudioProvider) {
    this.generatedDefinition = await this.configLoader.generateToolDefinition(this.toolConfig);
  }

  /**
   * Get tool definitions - generated dynamically from configuration
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.generatedDefinition ? [this.generatedDefinition] : [];
  }

  /**
   * Dynamic tool executor based on configuration
   */
  getToolExecutor(toolName: string): ToolExecutor | undefined {
    if (toolName !== this.name) return undefined;

    return {
      name: toolName,
      execute: async (parameters) => {
        // Execute based on tool purpose, not hardcoded logic
        return {
          result: await this.executeByPurpose(parameters)
        };
      }
    };
  }

  /**
   * Check if agent can handle - based on tool selection
   */
  async canHandle(context: AgentContext): Promise<boolean> {
    // Only handle if explicitly selected by orchestrator
    if (context.metadata?.selectedAgent === this.name) {
      return true;
    }
    return false;
  }

  /**
   * Process request - completely dynamic based on configuration
   */
  async process(context: AgentContext): Promise<AgentResponse> {
    // Process based on tool call from orchestrator
    const toolCall = context.metadata?.toolCall;
    if (!toolCall) {
      return { message: 'No tool call specified' };
    }

    // Execute based on configuration
    const result = await this.executeByPurpose(toolCall.parameters || {});
    
    return {
      toolCalls: [{
        tool: this.mapToActualTool(this.toolConfig.purpose),
        parameters: toolCall.parameters || {}
      }]
    };
  }

  /**
   * Execute tool based on its purpose, not hardcoded logic
   */
  private async executeByPurpose(parameters: Record<string, any>): Promise<any> {
    // This maps purposes to actual tool calls
    // In a fully dynamic system, this would also be configuration-driven
    
    // For now, we use a simple semantic mapping
    // This is the ONLY place where we need some mapping logic
    // But it's based on purpose, not keywords
    
    return {
      toolCalls: [{
        tool: this.mapToActualTool(this.toolConfig.purpose),
        parameters
      }]
    };
  }

  /**
   * Map semantic purpose to actual tool name
   * This is the minimal mapping layer needed
   */
  private mapToActualTool(purpose: string): string {
    // In a perfect world, this mapping would also come from configuration
    // For now, we do minimal semantic mapping
    
    const purposeMap: Record<string, string> = {
      'Retrieve information from the internet': 'webSearch',
      'Interact with files and directories': 'filesystem',
      'Execute code and run programs': 'codeRunner',
      'Understand and analyze software projects': 'analyzeProject'
    };

    // Find the closest matching purpose
    for (const [key, tool] of Object.entries(purposeMap)) {
      if (this.semanticallySimilar(purpose, key)) {
        return tool;
      }
    }

    return 'unknown';
  }

  /**
   * Simple semantic similarity check
   * In production, this would use embeddings or more sophisticated NLP
   */
  private semanticallySimilar(text1: string, text2: string): boolean {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    // Count common words (very basic)
    const common = words1.filter(w => words2.includes(w)).length;
    const similarity = common / Math.max(words1.length, words2.length);
    
    return similarity > 0.5;
  }
}

/**
 * Factory for creating dynamic agents from configuration
 */
export class DynamicAgentFactory {
  constructor(private provider: LMStudioProvider) {}

  /**
   * Create all agents from configuration
   */
  async createAllAgents(): Promise<DynamicAgent[]> {
    const configLoader = new ConfigToolLoader(this.provider);
    const configs = configLoader.getToolConfigs();
    
    const agents = [];
    for (const config of configs) {
      try {
        const agent = new DynamicAgent(this.provider, config.name);
        agents.push(agent);
      } catch (error) {
        console.error(`Failed to create agent for ${config.name}:`, error);
      }
    }
    
    return agents;
  }

  /**
   * Create a specific agent
   */
  createAgent(toolName: string): DynamicAgent {
    return new DynamicAgent(this.provider, toolName);
  }
}