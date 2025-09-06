import { Tool, ToolResult } from './index.js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface FileBrowserParams {
  path?: string;
  action?: 'browse' | 'select' | 'preview';
  filter?: string;
}

interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

// Helper functions outside the tool object
async function getDirectoryContents(dirPath: string, filter?: string): Promise<FileInfo[]> {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  const fileInfos: FileInfo[] = [];
  
  for (const item of items) {
    // Skip hidden files unless filter includes them
    if (item.name.startsWith('.') && !filter?.includes('hidden')) {
      continue;
    }
    
    const itemPath = path.join(dirPath, item.name);
    
    try {
      const stats = await fs.stat(itemPath);
      fileInfos.push({
        name: item.name,
        path: itemPath,
        type: item.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime,
      });
    } catch (error) {
      // Skip items we can't stat
      continue;
    }
  }
  
  // Sort: directories first, then by name
  return fileInfos.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function formatFileItem(item: FileInfo): string {
  const icon = item.type === 'directory' ? '📁' : getFileIcon(item.name);
  const name = item.type === 'directory' ? chalk.bold(item.name) : item.name;
  
  let details = '';
  if (item.type === 'file' && item.size !== undefined) {
    details = chalk.dim(` (${formatSize(item.size)})`);
  }
  
  return `${icon} ${name}${details}`;
}

function getFileIcon(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const iconMap: { [key: string]: string } = {
    '.js': '📄',
    '.ts': '📘',
    '.jsx': '⚛️',
    '.tsx': '⚛️',
    '.json': '📋',
    '.md': '📝',
    '.txt': '📃',
    '.css': '🎨',
    '.scss': '🎨',
    '.html': '🌐',
    '.py': '🐍',
    '.java': '☕',
    '.cpp': '⚙️',
    '.c': '⚙️',
    '.go': '🐹',
    '.rs': '🦀',
    '.sh': '🐚',
    '.yml': '⚙️',
    '.yaml': '⚙️',
    '.xml': '📰',
    '.png': '🖼️',
    '.jpg': '🖼️',
    '.jpeg': '🖼️',
    '.gif': '🖼️',
    '.svg': '🖼️',
    '.pdf': '📕',
    '.zip': '📦',
    '.tar': '📦',
    '.gz': '📦',
  };
  
  return iconMap[ext] || '📄';
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

async function previewFile(filePath: string): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    
    console.log(chalk.cyan('\n📄 File Preview:'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(`Path: ${filePath}`);
    console.log(`Size: ${formatSize(stats.size)}`);
    console.log(`Modified: ${stats.mtime.toLocaleString()}`);
    console.log(chalk.dim('─'.repeat(50)));
    
    // Show file content preview for text files
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.txt', '.md', '.js', '.ts', '.json', '.css', '.html', '.py', '.sh', '.yml', '.yaml'];
    
    if (textExtensions.includes(ext)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').slice(0, 10);
      console.log(chalk.dim('\nFirst 10 lines:'));
      lines.forEach((line, i) => {
        console.log(chalk.dim(`${(i + 1).toString().padStart(3)}: `) + line);
      });
      if (content.split('\n').length > 10) {
        console.log(chalk.dim('... (truncated)'));
      }
    }
    
    console.log('');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    
  } catch (error) {
    console.error(chalk.red(`Error previewing file: ${error}`));
  }
}

export const fileBrowserTool: Tool = {
  name: 'fileBrowser',
  description: 'Interactive file browser for navigating and selecting files',
  
  async execute(params: FileBrowserParams): Promise<ToolResult> {
    try {
      const startPath = params.path || process.cwd();
      const action = params.action || 'browse';
      
      let currentPath = path.resolve(startPath);
      let selectedPath: string | null = null;
      
      while (!selectedPath) {
        // Get directory contents
        const items = await getDirectoryContents(currentPath, params.filter);
        
        // Show current path
        console.log(chalk.cyan(`\n📁 Current directory: ${currentPath}`));
        
        // Create choices for inquirer
        const choices = [
          { name: chalk.dim('.. (parent directory)'), value: '..' },
          ...items.map((item: FileInfo) => ({
            name: formatFileItem(item),
            value: item.path,
            short: item.name,
          })),
        ];
        
        // Add action choices
        if (action === 'select') {
          choices.push(
            new inquirer.Separator() as any,
            { name: chalk.green('✓ Select current directory'), value: ':select-current:' }
          );
        }
        
        choices.push(
          { name: chalk.yellow('↩ Cancel'), value: ':cancel:' }
        );
        
        // Prompt user
        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: 'Navigate:',
            choices,
            pageSize: 15,
          },
        ]);
        
        // Handle selection
        if (selected === ':cancel:') {
          return { 
            success: false, 
            error: 'File browser cancelled' 
          };
        } else if (selected === ':select-current:') {
          selectedPath = currentPath;
        } else if (selected === '..') {
          currentPath = path.dirname(currentPath);
        } else {
          const selectedItem = items.find((item: FileInfo) => item.path === selected);
          if (selectedItem) {
            if (selectedItem.type === 'directory') {
              currentPath = selectedItem.path;
            } else {
              // File selected
              if (action === 'preview') {
                await previewFile(selectedItem.path);
                // Continue browsing after preview
              } else {
                selectedPath = selectedItem.path;
              }
            }
          }
        }
      }
      
      const stats = await fs.stat(selectedPath);
      return {
        success: true,
        data: {
          selectedPath,
          type: stats.isDirectory() ? 'directory' : 'file',
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};