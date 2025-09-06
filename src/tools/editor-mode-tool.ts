import { Tool, ToolResult } from './base.js';
import { EditorModeManager } from '../core/editor-modes.js';
import chalk from 'chalk';

export class EditorModeTool implements Tool {
  name = 'setEditorMode';
  description = 'Set editor mode (normal, vim, or emacs)';
  private editorModeManager: EditorModeManager;

  constructor() {
    this.editorModeManager = new EditorModeManager();
  }

  async execute(params: {
    mode: 'normal' | 'vim' | 'emacs';
    action?: 'set' | 'info' | 'help';
  }): Promise<ToolResult> {
    const { mode, action = 'set' } = params;

    try {
      switch (action) {
        case 'set':
          this.editorModeManager.setMode(mode);
          return {
            success: true,
            data: `Editor mode set to: ${mode}`
          };

        case 'info':
          const currentMode = this.editorModeManager.getMode();
          const status = this.editorModeManager.getStatus();
          return {
            success: true,
            data: {
              currentMode,
              status,
              message: `Current editor mode: ${currentMode}${status ? ` (${status})` : ''}`
            }
          };

        case 'help':
          const bindings = this.editorModeManager.getKeyBindings();
          const help = this.formatKeyBindings(mode, bindings);
          return {
            success: true,
            data: help
          };

        default:
          return {
            success: false,
            error: `Unknown action: ${action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to manage editor mode: ${(error as Error).message}`
      };
    }
  }

  private formatKeyBindings(mode: string, bindings: any[]): string {
    const title = chalk.bold.cyan(`${mode.toUpperCase()} Mode Key Bindings`);
    const separator = chalk.gray('─'.repeat(50));
    
    let help = `${title}\n${separator}\n\n`;

    if (mode === 'vim') {
      help += chalk.bold.yellow('Normal Mode:\n');
      const normalBindings = bindings.filter(b => 
        !b.key.includes(':') && !b.key.includes('INSERT') && !b.key.includes('ESC')
      );
      normalBindings.forEach(b => {
        help += `  ${chalk.green(b.key.padEnd(10))} - ${b.description}\n`;
      });

      help += '\n' + chalk.bold.yellow('Commands:\n');
      const commands = bindings.filter(b => b.key.includes(':'));
      commands.forEach(b => {
        help += `  ${chalk.green(b.key.padEnd(10))} - ${b.description}\n`;
      });

      help += '\n' + chalk.bold.yellow('Mode Changes:\n');
      const modes = bindings.filter(b => 
        b.key === 'i' || b.key === 'a' || b.key === 'o' || b.key === 'v' || b.key === 'ESC'
      );
      modes.forEach(b => {
        help += `  ${chalk.green(b.key.padEnd(10))} - ${b.description}\n`;
      });
    } else if (mode === 'emacs') {
      help += chalk.bold.yellow('Movement:\n');
      const movement = bindings.filter(b => 
        b.action.includes('move') || b.action.includes('Beginning') || 
        b.action.includes('End') || b.action.includes('line')
      );
      movement.forEach(b => {
        help += `  ${chalk.green(b.key.padEnd(10))} - ${b.description}\n`;
      });

      help += '\n' + chalk.bold.yellow('Editing:\n');
      const editing = bindings.filter(b => 
        b.action.includes('Kill') || b.action.includes('Yank') || 
        b.action.includes('mark')
      );
      editing.forEach(b => {
        help += `  ${chalk.green(b.key.padEnd(10))} - ${b.description}\n`;
      });

      help += '\n' + chalk.bold.yellow('File Operations:\n');
      const file = bindings.filter(b => 
        b.action.includes('Save') || b.action.includes('Quit')
      );
      file.forEach(b => {
        help += `  ${chalk.green(b.key.padEnd(10))} - ${b.description}\n`;
      });
    }

    help += '\n' + chalk.dim('Note: C- means Ctrl+, M- means Meta/Alt+');
    
    return help;
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['normal', 'vim', 'emacs'],
          description: 'Editor mode to set'
        },
        action: {
          type: 'string',
          enum: ['set', 'info', 'help'],
          description: 'Action to perform (default: set)'
        }
      },
      required: ['mode']
    };
  }
}

// Quick access tool for vim commands
export class VimCommandTool implements Tool {
  name = 'vim';
  description = 'Execute vim-style commands';
  private editorModeManager: EditorModeManager;

  constructor() {
    this.editorModeManager = new EditorModeManager();
  }

  async execute(params: {
    command: string;
    content?: string;
    position?: number;
  }): Promise<ToolResult> {
    const { command, content = '', position = 0 } = params;

    try {
      // Set vim mode if not already
      if (this.editorModeManager.getMode() !== 'vim') {
        this.editorModeManager.setMode('vim');
      }

      // Parse and execute vim command
      const result = this.parseVimCommand(command, content, position);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute vim command: ${(error as Error).message}`
      };
    }
  }

  private parseVimCommand(command: string, content: string, position: number): any {
    // Handle common vim commands
    const patterns = {
      // Movement
      move: /^(\d*)([hjklwb0$G])$/,
      // Editing
      delete: /^(\d*)d([dw$0])$/,
      yank: /^(\d*)y([yw$0])$/,
      // Search
      search: /^\/(.+)$/,
      // Replace
      replace: /^:s\/(.+?)\/(.+?)\/(g?)$/,
      // Global replace
      globalReplace: /^:%s\/(.+?)\/(.+?)\/(g?)$/,
      // Save/quit
      write: /^:w$/,
      quit: /^:q$/,
      writeQuit: /^:wq$/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = command.match(pattern);
      if (match) {
        switch (type) {
          case 'move':
            return {
              type: 'movement',
              count: parseInt(match[1] || '1'),
              direction: match[2],
              description: `Move ${match[1] || ''}${match[2]}`
            };
          
          case 'delete':
            return {
              type: 'delete',
              count: parseInt(match[1] || '1'),
              motion: match[2],
              description: `Delete ${match[1] || ''}${match[2]}`
            };
          
          case 'yank':
            return {
              type: 'yank',
              count: parseInt(match[1] || '1'),
              motion: match[2],
              description: `Yank ${match[1] || ''}${match[2]}`
            };
          
          case 'search':
            return {
              type: 'search',
              pattern: match[1],
              description: `Search for: ${match[1]}`
            };
          
          case 'replace':
            return {
              type: 'replace',
              find: match[1],
              replace: match[2],
              global: match[3] === 'g',
              description: `Replace ${match[1]} with ${match[2]}${match[3] === 'g' ? ' (global)' : ''}`
            };
          
          case 'write':
            return {
              type: 'save',
              description: 'Save file'
            };
          
          case 'quit':
            return {
              type: 'quit',
              description: 'Quit'
            };
          
          case 'writeQuit':
            return {
              type: 'save-quit',
              description: 'Save and quit'
            };
        }
      }
    }

    return {
      type: 'unknown',
      command,
      description: `Unknown command: ${command}`
    };
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Vim command to execute'
        },
        content: {
          type: 'string',
          description: 'Content to operate on (optional)'
        },
        position: {
          type: 'number',
          description: 'Cursor position (optional)'
        }
      },
      required: ['command']
    };
  }
}

// Export tools
export const editorModeTool = new EditorModeTool();
export const vimCommandTool = new VimCommandTool();