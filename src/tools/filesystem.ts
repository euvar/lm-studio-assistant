import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './base.js';
import { SyntaxHighlighter } from '../core/syntax.js';

export const readFileTool: Tool = {
  name: 'readFile',
  description: 'Read the contents of a file',
  async execute(params: { path: string }): Promise<ToolResult> {
    try {
      const filePath = path.resolve(params.path);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Apply syntax highlighting if it's a code file
      const highlighted = SyntaxHighlighter.formatCodeBlock(content, undefined, filePath);
      
      return {
        success: true,
        data: highlighted,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const writeFileTool: Tool = {
  name: 'writeFile',
  description: 'Write content to a file',
  async execute(params: { path: string; content: string }): Promise<ToolResult> {
    try {
      const filePath = path.resolve(params.path);
      const dir = path.dirname(filePath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });
      
      // Write the file
      await fs.writeFile(filePath, params.content, 'utf-8');
      
      return {
        success: true,
        data: `File written successfully: ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const listFilesTool: Tool = {
  name: 'listFiles',
  description: 'List files in a directory',
  async execute(params: { path?: string }): Promise<ToolResult> {
    try {
      const dirPath = path.resolve(params.path || '.');
      const files = await fs.readdir(dirPath);
      
      const fileDetails = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
          };
        })
      );
      
      return {
        success: true,
        data: fileDetails,
        path: dirPath,
      } as ToolResult & { path: string };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const deleteFileTool: Tool = {
  name: 'deleteFile',
  description: 'Delete a file or empty directory',
  async execute(params: { path: string }): Promise<ToolResult> {
    try {
      const filePath = path.resolve(params.path);
      await fs.unlink(filePath);
      
      return {
        success: true,
        data: `File deleted successfully: ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const editFileTool: Tool = {
  name: 'editFile',
  description: 'Edit specific parts of a file by replacing text',
  async execute(params: { path: string; search: string; replace: string; all?: boolean }): Promise<ToolResult> {
    try {
      const filePath = path.resolve(params.path);
      
      // Read the current file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Find and replace
      let newContent: string;
      let changeCount = 0;
      
      if (params.all) {
        // Replace all occurrences
        const regex = new RegExp(params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        newContent = content.replace(regex, () => {
          changeCount++;
          return params.replace;
        });
      } else {
        // Replace first occurrence only
        const index = content.indexOf(params.search);
        if (index === -1) {
          return {
            success: false,
            error: `Text not found: "${params.search.substring(0, 50)}${params.search.length > 50 ? '...' : ''}"`,
          };
        }
        newContent = content.substring(0, index) + params.replace + content.substring(index + params.search.length);
        changeCount = 1;
      }
      
      if (changeCount === 0) {
        return {
          success: false,
          error: 'No matches found for the search text',
        };
      }
      
      // Write the updated content
      await fs.writeFile(filePath, newContent, 'utf-8');
      
      return {
        success: true,
        data: `File edited successfully: ${changeCount} replacement${changeCount > 1 ? 's' : ''} made in ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const appendToFileTool: Tool = {
  name: 'appendToFile',
  description: 'Append content to the end of a file',
  async execute(params: { path: string; content: string }): Promise<ToolResult> {
    try {
      const filePath = path.resolve(params.path);
      
      // Ensure file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist, create it
        await fs.writeFile(filePath, '', 'utf-8');
      }
      
      // Append content
      await fs.appendFile(filePath, params.content, 'utf-8');
      
      return {
        success: true,
        data: `Content appended successfully to ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to append to file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};