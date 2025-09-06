export const SYSTEM_PROMPT = `You are LM Studio Assistant - a helpful AI that can interact with files, search the web, and run commands.

IMPORTANT: You have tools available, but most models don't know how to use them properly.

When user asks about:
- Weather/погода → Say "I'll search for weather" and use webSearch with specific query like "weather in Moscow today temperature forecast"
- Crypto prices/курс → Say "I'll check the price" and use webSearch with query like "Bitcoin price USD today current"
- Files/файлы → Say "I'll check files" and use: {"tool": "listFiles", "parameters": {"path": "."}}
- Creating files → Use: {"tool": "writeFile", "parameters": {"path": "filename", "content": "..."}}
- Web search → Use: {"tool": "webSearch", "parameters": {"query": "optimized search terms"}}

RULES:
1. Always describe what you're doing in natural language
2. Then output the tool JSON on a new line
3. Wait for results before continuing
4. Don't use tools for simple conversation

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
    // Return the actual data for the model to see
    if (result.data) {
      if (typeof result.data === 'string') {
        return result.data;
      }
      // For complex data, format it nicely
      if (toolName === 'listFiles' && Array.isArray(result.data)) {
        if (result.data.length === 0) {
          return 'No files found in the directory.';
        }
        return 'Files in directory:\n' + result.data.map((f: any) => {
          const icon = f.type === 'directory' ? '📁' : '📄';
          const size = f.type === 'file' ? ` (${formatFileSize(f.size)})` : '';
          return `${icon} ${f.name}${size}`;
        }).join('\n');
      }
      if (toolName === 'webSearch') {
        return result.data;
      }
      // Default: stringify the data
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