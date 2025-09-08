/**
 * File System Agent - Clean Implementation
 * Only tool definitions, no patterns
 */

import { CleanAgent } from './clean-agent.js';
import { ToolDefinition, ToolExecutor } from '../types/tool-definitions.js';

export class FileSystemAgent extends CleanAgent {
  name = 'file-system';
  description = 'Manages files and directories';
  capabilities = ['file operations'];

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'list_files',
        description: 'List files in a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path'
            },
            content: {
              type: 'string',
              description: 'Content to write'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file or directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to delete'
            }
          },
          required: ['path']
        }
      }
    ];
  }

  getToolExecutor(toolName: string): ToolExecutor | undefined {
    const executors: Record<string, ToolExecutor> = {
      list_files: {
        name: 'list_files',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'listFiles',
              parameters: { path: params.path }
            }]
          }
        })
      },
      read_file: {
        name: 'read_file',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'readFile',
              parameters: { path: params.path }
            }]
          }
        })
      },
      write_file: {
        name: 'write_file',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'writeFile',
              parameters: params
            }]
          }
        })
      },
      delete_file: {
        name: 'delete_file',
        execute: async (params) => ({
          result: {
            toolCalls: [{
              tool: 'filesystem',
              parameters: {
                action: 'delete',
                path: params.path
              }
            }]
          }
        })
      }
    };

    return executors[toolName];
  }
}