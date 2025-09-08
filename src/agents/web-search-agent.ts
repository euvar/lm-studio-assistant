/**
 * Web Search Agent - Clean Implementation
 * Only tool definitions, no patterns
 */

import { CleanAgent } from './clean-agent.js';
import { ToolDefinition, ToolExecutor } from '../types/tool-definitions.js';

export class WebSearchAgent extends CleanAgent {
  name = 'web-search';
  description = 'Searches the internet for information';
  capabilities = ['web search'];

  getToolDefinitions(): ToolDefinition[] {
    return [{
      name: 'search_web',
      description: 'Search the internet for current information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to search for'
          }
        },
        required: ['query']
      }
    }];
  }

  getToolExecutor(toolName: string): ToolExecutor | undefined {
    if (toolName === 'search_web') {
      return {
        name: 'search_web',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'webSearch',
              parameters: { query: params.query }
            }]
          }
        })
      };
    }
    return undefined;
  }
}