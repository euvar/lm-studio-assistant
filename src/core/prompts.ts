import chalk from 'chalk';

export const SYSTEM_PROMPT = `You are LM Studio Assistant - a helpful AI that thinks before acting.

You have access to tools, but you should THINK about what the user wants before using them.

Process:
1. Understand what the user is asking
2. Decide which tools to use
3. Execute tools with proper parameters
4. Provide a clear answer based on results

Available tools:
{{tools}}`;

export const TOOL_RESULT_PREFIX = 'Tool result';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  else if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  else if (bytes < 1024 * 1024 * 1024) return Math.round(bytes / 1024 / 1024) + 'MB';
  else return Math.round(bytes / 1024 / 1024 / 1024) + 'GB';
}

export function formatToolResult(toolName: string, result: any): string {
  if (result.success) {
    if (result.data) {
      if (typeof result.data === 'string') {
        return result.data;
      }
      
      if (toolName === 'listFiles' && Array.isArray(result.data)) {
        if (result.data.length === 0) {
          return 'No files found in the directory.';
        }
        
        // Get current path from result or default
        const currentPath = (result as any).path || '.';
        let output = `📂 Directory: ${currentPath}\n`;
        
        // Add navigation hint if not at root
        if (currentPath !== '/' && currentPath !== '.') {
          output += chalk.dim('💡 Tip: Say "покажи папку выше" to go up\n');
        }
        
        output += '\n' + result.data.map((f: any) => {
          const icon = f.type === 'directory' ? '📁' : '📄';
          const size = f.type === 'file' ? ` (${formatFileSize(f.size)})` : '';
          return `${icon} ${f.name}${size}`;
        }).join('\n');
        
        return output;
      }
      
      if (toolName === 'webSearch') {
        return result.data;
      }
      
      return JSON.stringify(result.data, null, 2);
    }
    return `✅ ${toolName} completed successfully`;
  } else {
    return `❌ ${toolName} failed: ${result.error}`;
  }
}

export function buildSystemPrompt(toolDescriptions: string): string {
  return SYSTEM_PROMPT.replace('{{tools}}', toolDescriptions);
}