/**
 * Code Execution Agent - Clean Implementation
 * Only tool definitions, no patterns
 */

import { CleanAgent } from './clean-agent.js';
import { ToolDefinition, ToolExecutor } from '../types/tool-definitions.js';

export class CodeExecutionAgent extends CleanAgent {
  name = 'code-execution';
  description = 'Executes code and commands';
  capabilities = ['code execution'];

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'run_code',
        description: 'Execute code in a specific language',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code to execute'
            },
            language: {
              type: 'string',
              description: 'Programming language',
              enum: ['javascript', 'python', 'bash', 'typescript']
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'run_command',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'analyze_project',
        description: 'Analyze a software project',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Project path'
            }
          },
          required: ['path']
        }
      }
    ];
  }

  getToolExecutor(toolName: string): ToolExecutor | undefined {
    const executors: Record<string, ToolExecutor> = {
      run_code: {
        name: 'run_code',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'codeRunner',
              parameters: params
            }]
          }
        })
      },
      run_command: {
        name: 'run_command',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'bash',
              parameters: { command: params.command }
            }]
          }
        })
      },
      analyze_project: {
        name: 'analyze_project',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'analyzeProject',
              parameters: { path: params.path || '.' }
            }]
          }
        })
      }
    };

    return executors[toolName];
  }
}