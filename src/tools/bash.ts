import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './base.js';

const execAsync = promisify(exec);

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute bash commands',
  async execute(params: { command: string }): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024, // 1MB
        timeout: 30000, // 30 seconds
      });

      return {
        success: true,
        data: {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command: params.command,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Command failed: ${error.message}`,
        data: {
          stdout: error.stdout?.trim(),
          stderr: error.stderr?.trim(),
          command: params.command,
          code: error.code,
        },
      };
    }
  },
};