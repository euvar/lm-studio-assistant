import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './base.js';
import { SimpleProgress } from '../core/progress.js';
import chalk from 'chalk';

const execAsync = promisify(exec);

export const gitStatusTool: Tool = {
  name: 'gitStatus',
  description: 'Show git repository status',
  async execute(params: { path?: string }): Promise<ToolResult> {
    const progress = new SimpleProgress('Checking git status...');
    
    try {
      const cwd = params.path || process.cwd();
      const { stdout } = await execAsync('git status --porcelain', { cwd });
      
      if (!stdout.trim()) {
        progress.succeed('Repository is clean');
        return {
          success: true,
          data: '✨ Working directory is clean - no changes to commit',
        };
      }

      // Parse git status output
      const lines = stdout.trim().split('\n');
      const changes = {
        staged: [] as string[],
        modified: [] as string[],
        untracked: [] as string[],
      };

      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        
        if (status[0] !== ' ' && status[0] !== '?') {
          changes.staged.push(`${file} (${getStatusDescription(status[0])})`);
        }
        if (status[1] !== ' ' && status[1] !== '?') {
          changes.modified.push(`${file} (${getStatusDescription(status[1])})`);
        }
        if (status === '??') {
          changes.untracked.push(file);
        }
      }

      let output = '';
      if (changes.staged.length > 0) {
        output += chalk.green('\n📦 Staged changes:\n');
        output += changes.staged.map(f => `   ${chalk.green('+')} ${f}`).join('\n');
      }
      if (changes.modified.length > 0) {
        output += chalk.yellow('\n\n✏️  Modified files:\n');
        output += changes.modified.map(f => `   ${chalk.yellow('M')} ${f}`).join('\n');
      }
      if (changes.untracked.length > 0) {
        output += chalk.gray('\n\n📄 Untracked files:\n');
        output += changes.untracked.map(f => `   ${chalk.gray('?')} ${f}`).join('\n');
      }

      progress.succeed('Git status retrieved');
      return {
        success: true,
        data: output,
      };
    } catch (error: any) {
      progress.fail('Failed to get git status');
      return {
        success: false,
        error: error.stderr || error.message,
      };
    }
  },

};

function getStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    'M': 'modified',
    'A': 'added',
    'D': 'deleted',
    'R': 'renamed',
    'C': 'copied',
    'U': 'updated',
  };
  return descriptions[status] || status;
}

export const gitCommitTool: Tool = {
  name: 'gitCommit',
  description: 'Create a git commit with a message',
  async execute(params: { message: string; all?: boolean }): Promise<ToolResult> {
    const progress = new SimpleProgress('Creating git commit...');
    
    try {
      // Stage changes if requested
      if (params.all) {
        await execAsync('git add -A');
        progress.update('Files staged, committing...');
      }

      // Create commit
      const { stdout } = await execAsync(`git commit -m "${params.message.replace(/"/g, '\\"')}"`);
      
      progress.succeed('Commit created successfully');
      return {
        success: true,
        data: stdout,
      };
    } catch (error: any) {
      progress.fail('Failed to create commit');
      return {
        success: false,
        error: error.stderr || error.message,
      };
    }
  },
};

export const gitLogTool: Tool = {
  name: 'gitLog',
  description: 'Show git commit history',
  async execute(params: { limit?: number; oneline?: boolean }): Promise<ToolResult> {
    try {
      const limit = params.limit || 10;
      const format = params.oneline ? '--oneline' : '--pretty=format:"%h - %an, %ar : %s"';
      
      const { stdout } = await execAsync(`git log ${format} -${limit}`);
      
      return {
        success: true,
        data: stdout || 'No commits yet',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.stderr || error.message,
      };
    }
  },
};

export const gitDiffTool: Tool = {
  name: 'gitDiff',
  description: 'Show changes in files',
  async execute(params: { staged?: boolean; file?: string }): Promise<ToolResult> {
    try {
      let command = 'git diff';
      if (params.staged) {
        command += ' --cached';
      }
      if (params.file) {
        command += ` -- ${params.file}`;
      }
      
      const { stdout } = await execAsync(command);
      
      if (!stdout) {
        return {
          success: true,
          data: 'No changes to show',
        };
      }

      // Add some color to the diff output
      const coloredDiff = stdout
        .replace(/^\+(?!\+\+).*/gm, (match) => chalk.green(match))
        .replace(/^-(?!--).*/gm, (match) => chalk.red(match))
        .replace(/^@@.*@@/gm, (match) => chalk.cyan(match));
      
      return {
        success: true,
        data: coloredDiff,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.stderr || error.message,
      };
    }
  },
};

export const gitBranchTool: Tool = {
  name: 'gitBranch',
  description: 'List, create, or switch git branches',
  async execute(params: { create?: string; switch?: string; list?: boolean }): Promise<ToolResult> {
    try {
      if (params.create) {
        const { stdout } = await execAsync(`git branch ${params.create}`);
        return {
          success: true,
          data: `Branch '${params.create}' created`,
        };
      }
      
      if (params.switch) {
        const { stdout } = await execAsync(`git checkout ${params.switch}`);
        return {
          success: true,
          data: `Switched to branch '${params.switch}'`,
        };
      }
      
      // Default: list branches
      const { stdout } = await execAsync('git branch -a');
      const branches = stdout.split('\n').map(branch => {
        if (branch.startsWith('*')) {
          return chalk.green(branch);
        }
        return branch;
      }).join('\n');
      
      return {
        success: true,
        data: branches,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.stderr || error.message,
      };
    }
  },
};