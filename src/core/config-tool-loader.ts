/**
 * Tool Definition Loader
 * Loads tool definitions from configuration files without hardcoded strings
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ToolDefinition } from '../types/tool-definitions.js';
import { LMStudioProvider } from '../providers/lmstudio.js';

export interface ConfigToolDefinition {
  name: string;
  purpose: string;
  capabilities: string[];
  examples: Array<{
    scenario: string;
    reasoning: string;
  }>;
}

export class ConfigToolLoader {
  private configPath: string;
  private tools: Map<string, ConfigToolDefinition> = new Map();

  constructor(
    private provider: LMStudioProvider,
    configPath: string = join(process.cwd(), 'src/config/tool-definitions.json')
  ) {
    this.configPath = configPath;
    this.loadTools();
  }

  /**
   * Load tools from configuration file
   */
  private loadTools(): void {
    try {
      const configContent = readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configContent);
      
      for (const tool of config.tools) {
        this.tools.set(tool.name, tool);
      }
    } catch (error) {
      console.error('Failed to load tool definitions:', error);
    }
  }

  /**
   * Get all loaded tool configurations
   */
  getToolConfigs(): ConfigToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Generate LLM-friendly tool definition from config
   * Uses the LLM itself to create natural descriptions
   */
  async generateToolDefinition(toolConfig: ConfigToolDefinition): Promise<ToolDefinition> {
    const prompt = `Create a natural language description for a tool that helps an AI understand when to use it.

Tool Purpose: ${toolConfig.purpose}

What it can do:
${toolConfig.capabilities.map(cap => `- ${cap}`).join('\n')}

Example use cases:
${toolConfig.examples.map(ex => `- Scenario: ${ex.scenario}\n  Why use this tool: ${ex.reasoning}`).join('\n\n')}

Write a comprehensive description that explains:
1. The semantic purpose of this tool
2. When it should be used
3. What problems it solves

Do NOT include keywords or pattern lists. Focus on explaining the tool's purpose and capabilities in natural language.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are creating tool descriptions for an AI assistant. Write clear, semantic descriptions without listing keywords.' },
      { role: 'user', content: prompt }
    ], 0.7);

    // Generate parameters dynamically based on capabilities
    const parameters = await this.generateParameters(toolConfig);

    return {
      name: toolConfig.name,
      description: response.content,
      parameters
    };
  }

  /**
   * Generate parameters based on tool capabilities
   */
  private async generateParameters(toolConfig: ConfigToolDefinition): Promise<ToolDefinition['parameters']> {
    const prompt = `Based on this tool's purpose and capabilities, define the parameters it needs.

Tool: ${toolConfig.name}
Purpose: ${toolConfig.purpose}
Capabilities: ${toolConfig.capabilities.join(', ')}

Generate a JSON schema for the parameters this tool would need.
Consider what inputs are necessary for each capability.

Respond with only valid JSON in this format:
{
  "type": "object",
  "properties": {
    "paramName": {
      "type": "string|number|boolean|array|object",
      "description": "what this parameter is for"
    }
  },
  "required": ["list", "of", "required", "params"]
}`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'You are a JSON schema generator. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ], 0.1);

      return JSON.parse(response.content);
    } catch {
      // Fallback to basic parameters
      return {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input for the tool'
          }
        }
      };
    }
  }

  /**
   * Reload tools from configuration
   */
  reload(): void {
    this.tools.clear();
    this.loadTools();
  }

  /**
   * Add or update a tool configuration
   */
  addTool(tool: ConfigToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a specific tool configuration
   */
  getTool(name: string): ConfigToolDefinition | undefined {
    return this.tools.get(name);
  }
}