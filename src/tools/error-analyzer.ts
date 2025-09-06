import { Tool, ToolResult } from './base.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

interface ErrorInfo {
  message: string;
  line?: number;
  column?: number;
  file?: string;
  stack?: string;
  suggestion?: string;
}

export const analyzeErrorTool: Tool = {
  name: 'analyzeError',
  description: 'Analyze JavaScript/TypeScript errors and suggest fixes',
  async execute(params: { error: string; filePath?: string }): Promise<ToolResult> {
    try {
      const errorInfo = parseError(params.error);
      
      if (params.filePath && errorInfo.line) {
        // Read the problematic file
        const content = await fs.readFile(params.filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Get context around error
        const startLine = Math.max(0, errorInfo.line - 3);
        const endLine = Math.min(lines.length, errorInfo.line + 3);
        
        errorInfo.file = params.filePath;
        errorInfo.suggestion = await getSuggestion(errorInfo, lines[errorInfo.line - 1]);
      }
      
      return {
        success: true,
        data: formatErrorAnalysis(errorInfo),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to analyze error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const fixSyntaxErrorTool: Tool = {
  name: 'fixSyntaxError',
  description: 'Fix syntax errors in JavaScript files',
  async execute(params: { path: string }): Promise<ToolResult> {
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      let fixedContent = content;
      
      // Common syntax error patterns and fixes
      const fixes = [
        // Fix empty assignment
        { pattern: /const\s+(\w+)\s*=\s*;/g, replacement: 'const $1 = undefined;' },
        { pattern: /let\s+(\w+)\s*=\s*;/g, replacement: 'let $1 = undefined;' },
        { pattern: /var\s+(\w+)\s*=\s*;/g, replacement: 'var $1 = undefined;' },
        
        // Fix missing semicolons
        { pattern: /^(.*[^;{}\s])(\s*)$/gm, replacement: '$1;$2' },
        
        // Fix unclosed strings
        { pattern: /'([^']*?)$/gm, replacement: "'$1'" },
        { pattern: /"([^"]*?)$/gm, replacement: '"$1"' },
        
        // Fix unclosed brackets
        { pattern: /\{([^}]*?)$/m, replacement: '{$1}' },
        { pattern: /\[([^\]]*?)$/m, replacement: '[$1]' },
        { pattern: /\(([^)]*?)$/m, replacement: '($1)' },
      ];
      
      // Apply fixes
      for (const fix of fixes) {
        fixedContent = fixedContent.replace(fix.pattern, fix.replacement);
      }
      
      // Write fixed content back
      await fs.writeFile(params.path, fixedContent);
      
      return {
        success: true,
        data: `Fixed syntax errors in ${params.path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fix syntax errors: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const runJavaScriptTool: Tool = {
  name: 'runJavaScript',
  description: 'Run JavaScript or TypeScript files and capture output/errors',
  async execute(params: { path: string; args?: string[] }): Promise<ToolResult> {
    return new Promise((resolve) => {
      const filePath = path.resolve(params.path);
      const ext = path.extname(filePath);
      
      // Determine command based on file extension
      let command: string;
      let args: string[] = [];
      
      if (ext === '.ts') {
        command = 'npx';
        args = ['tsx', filePath, ...(params.args || [])];
      } else if (ext === '.js') {
        command = 'node';
        args = [filePath, ...(params.args || [])];
      } else {
        resolve({
          success: false,
          error: `Unsupported file type: ${ext}. Only .js and .ts files are supported.`,
        });
        return;
      }
      
      let output = '';
      let errorOutput = '';
      
      const child = spawn(command, args, {
        cwd: path.dirname(filePath),
      });
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            data: output || 'Script executed successfully with no output.',
          });
        } else {
          // Parse error for better formatting
          const errorInfo = parseError(errorOutput);
          resolve({
            success: false,
            error: formatErrorForDisplay(errorInfo, errorOutput),
          });
        }
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to run script: ${error.message}`,
        });
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          error: 'Script execution timed out after 30 seconds.',
        });
      }, 30000);
    });
  },
};

function parseError(errorText: string): ErrorInfo {
  const info: ErrorInfo = {
    message: errorText,
  };
  
  // Try to extract file path and line number
  const fileMatch = errorText.match(/at\s+(?:.*?\s+)?\(?(.*?):(\d+):(\d+)\)?/);
  if (fileMatch) {
    info.file = fileMatch[1];
    info.line = parseInt(fileMatch[2]);
    info.column = parseInt(fileMatch[3]);
  }
  
  // Extract main error message
  const messageMatch = errorText.match(/^([A-Z]\w*Error):\s*(.+?)(?:\n|$)/m);
  if (messageMatch) {
    info.message = `${messageMatch[1]}: ${messageMatch[2]}`;
  }
  
  // Common Node.js errors
  if (errorText.includes('Cannot find module')) {
    const moduleMatch = errorText.match(/Cannot find module\s*'([^']+)'/);
    if (moduleMatch) {
      info.suggestion = `Install missing module: npm install ${moduleMatch[1]}`;
    }
  }
  
  if (errorText.includes('is not a function')) {
    info.suggestion = 'Check if the function exists and is properly imported/defined';
  }
  
  if (errorText.includes('Cannot read properties of undefined')) {
    info.suggestion = 'Add null/undefined checks before accessing properties';
  }
  
  if (errorText.includes('ENOENT: no such file or directory')) {
    info.suggestion = 'Check if the file path is correct and the file exists';
  }
  
  return info;
}

async function getSuggestion(error: ErrorInfo, codeLine?: string): Promise<string> {
  const suggestions: string[] = [];
  
  if (codeLine) {
    // Check for common issues
    if (codeLine.includes('fs.readFile') && !codeLine.includes('await')) {
      suggestions.push('Add "await" before fs.readFile or use fs.promises');
    }
    
    if (codeLine.includes('require(') && codeLine.includes('.json')) {
      suggestions.push('Make sure the JSON file exists and has valid syntax');
    }
    
    if (codeLine.includes('* ') && error.message.includes('multiply')) {
      suggestions.push('Check if values are numbers, not strings. Use parseInt() or parseFloat()');
    }
  }
  
  return suggestions.length > 0 ? suggestions.join('\n') : error.suggestion || '';
}

function formatErrorAnalysis(error: ErrorInfo): string {
  let output = `🔍 Error Analysis:\n\n`;
  
  output += `❌ Error: ${error.message}\n`;
  
  if (error.file && error.line) {
    output += `📍 Location: ${error.file}:${error.line}:${error.column || 0}\n`;
  }
  
  if (error.suggestion) {
    output += `\n💡 Suggestion:\n${error.suggestion}\n`;
  }
  
  return output;
}

function formatErrorForDisplay(error: ErrorInfo, fullError: string): string {
  let output = `❌ Script failed with error:\n\n`;
  
  if (error.message !== fullError) {
    output += `Main Error: ${error.message}\n\n`;
  }
  
  if (error.file && error.line) {
    output += `Location: ${error.file}:${error.line}:${error.column || 0}\n\n`;
  }
  
  if (error.suggestion) {
    output += `💡 ${error.suggestion}\n\n`;
  }
  
  output += `Full Error Output:\n${fullError}`;
  
  return output;
}