import { Tool, ToolResult } from './base.js';
import { MinimapNavigation } from '../core/minimap-navigation.js';
import * as fs from 'fs/promises';

export class MinimapTool implements Tool {
  name = 'navigateWithMinimap';
  description = 'Navigate large files using a visual minimap';
  private minimapNav: MinimapNavigation;

  constructor() {
    this.minimapNav = new MinimapNavigation();
  }

  async execute(params: {
    filePath: string;
    action?: 'view' | 'search' | 'goto';
    searchTerm?: string;
    lineNumber?: number;
  }): Promise<ToolResult> {
    const { filePath, action = 'view', searchTerm, lineNumber } = params;

    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Initialize minimap
      await this.minimapNav.initialize(content);
      
      switch (action) {
        case 'view':
          // Start interactive minimap
          const viewResult = await this.startInteractiveMode(filePath);
          return { success: true, data: viewResult };
          
        case 'search':
          if (!searchTerm) {
            throw new Error('Search term is required for search action');
          }
          const searchResult = await this.searchInFile(searchTerm);
          return { success: true, data: searchResult };
          
        case 'goto':
          if (!lineNumber) {
            throw new Error('Line number is required for goto action');
          }
          const gotoResult = this.goToLine(lineNumber);
          return { success: true, data: gotoResult };
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
    } catch (error) {
      return {
        success: false,
        error: `Minimap navigation failed: ${(error as Error).message}`
      };
    }
  }

  private async startInteractiveMode(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      console.log(`Starting minimap navigation for: ${filePath}`);
      console.log('Use arrow keys to navigate, Enter to jump to region, q to quit\n');
      
      this.minimapNav.once('exit', () => {
        const position = this.minimapNav.getCurrentPosition();
        resolve(`Exited at line ${position.line}${position.region ? ` in ${position.region.name}` : ''}`);
      });
      
      this.minimapNav.start();
    });
  }

  private async searchInFile(searchTerm: string): Promise<string> {
    const results = await this.minimapNav.searchAndNavigate(searchTerm);
    
    if (results.found) {
      return `Found ${results.totalMatches} matches for "${searchTerm}"\n` +
        `Currently at match ${results.currentMatch}\n\n` +
        'Matches:\n' +
        results.locations!.map(loc => 
          `  Line ${loc.line}: ${loc.preview}...`
        ).join('\n');
    } else {
      return `No matches found for "${searchTerm}"`;
    }
  }

  private goToLine(lineNumber: number): string {
    this.minimapNav.goToLine(lineNumber);
    const position = this.minimapNav.getCurrentPosition();
    
    return `Navigated to line ${position.line}` +
      (position.region ? ` in ${position.region.name}` : '');
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to navigate'
        },
        action: {
          type: 'string',
          enum: ['view', 'search', 'goto'],
          description: 'Navigation action (default: view)'
        },
        searchTerm: {
          type: 'string',
          description: 'Term to search for (required for search action)'
        },
        lineNumber: {
          type: 'number',
          description: 'Line number to navigate to (required for goto action)'
        }
      },
      required: ['filePath']
    };
  }
}

// Quick navigation tool for common operations
export class QuickNavTool implements Tool {
  name = 'quickNav';
  description = 'Quick file navigation commands';

  async execute(params: {
    command: 'functions' | 'classes' | 'todos' | 'errors' | 'imports';
    filePath: string;
  }): Promise<ToolResult> {
    const { command, filePath } = params;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const results: Array<{ line: number; text: string }> = [];

      switch (command) {
        case 'functions':
          lines.forEach((line, index) => {
            if (line.match(/function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(/)) {
              results.push({ line: index + 1, text: line.trim() });
            }
          });
          break;

        case 'classes':
          lines.forEach((line, index) => {
            if (line.match(/class\s+\w+/)) {
              results.push({ line: index + 1, text: line.trim() });
            }
          });
          break;

        case 'todos':
          lines.forEach((line, index) => {
            if (line.match(/TODO|FIXME|HACK|XXX|NOTE/i)) {
              results.push({ line: index + 1, text: line.trim() });
            }
          });
          break;

        case 'errors':
          lines.forEach((line, index) => {
            if (line.match(/throw\s+|console\.error|Error\(|\.catch\(/)) {
              results.push({ line: index + 1, text: line.trim() });
            }
          });
          break;

        case 'imports':
          lines.forEach((line, index) => {
            if (line.match(/^import\s+|^const.*require\(/)) {
              results.push({ line: index + 1, text: line.trim() });
            }
          });
          break;
      }

      if (results.length === 0) {
        return { success: true, data: `No ${command} found in ${filePath}` };
      }

      return {
        success: true,
        data: `Found ${results.length} ${command} in ${filePath}:\n\n` +
          results.map(r => `Line ${r.line}: ${r.text}`).join('\n')
      };

    } catch (error) {
      return {
        success: false,
        error: `Quick navigation failed: ${(error as Error).message}`
      };
    }
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['functions', 'classes', 'todos', 'errors', 'imports'],
          description: 'Type of elements to find'
        },
        filePath: {
          type: 'string',
          description: 'Path to the file to search'
        }
      },
      required: ['command', 'filePath']
    };
  }
}

// Export tools
export const minimapTool = new MinimapTool();
export const quickNavTool = new QuickNavTool();