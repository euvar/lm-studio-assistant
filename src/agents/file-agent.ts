import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import chalk from 'chalk';

export class FileAgent extends BaseAgent {
  name = 'file-operations';
  description = 'Handles file system operations';
  capabilities = ['list files', 'read files', 'write files', 'edit files', 'delete files'];

  async canHandle(context: AgentContext): Promise<boolean> {
    const input = context.userInput.toLowerCase();
    
    // Skip if asking for current directory (pwd command)
    if (/current\s+directory|текущ.*директор/.test(input) && !(/файл|file/.test(input))) {
      return false;
    }
    
    // Skip if asking for system info
    if (/system\s+info|процесс|process/.test(input)) {
      return false;
    }
    
    const filePatterns = [
      /файл|file/,
      /папк.*файл|folder.*file|файл.*папк|file.*folder/,
      /покаж.*файл|show.*file|list.*file/,
      /создай.*файл|create.*file/,
      /create.*server|создай.*сервер/,  // Add pattern for creating server
      /удали.*файл|delete.*file|remove.*file/,
      /прочитай|read|открой/,
      /редактир|edit|измени/,
      /запиши|write|сохрани/,
      // Simple delete with filename
      /^(delete|remove|удали)\s+\S+\.\w+$/i,
      // Create patterns for common file creation
      /create.*\.(js|ts|py|java|cpp|c|go|rs|rb|php|html|css|json|xml|yaml|yml|md|txt)$/i
    ];
    
    return filePatterns.some(pattern => pattern.test(input));
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    const input = context.userInput.toLowerCase();
    const originalInput = context.userInput;  // Preserve original case for content extraction
    const toolCalls = [];

    // Check if we're being orchestrated
    const isOrchestrated = context.metadata?.orchestratorTask;
    // Visual logging is handled by orchestrator, no need to log here

    // Determine which file operation
    if ((/покаж|show|list|перечисли/.test(input) && /файл|папк|folder|directory/.test(input)) ||
        input === 'покажи файлы' || 
        input === 'покажи мне файлы' ||
        input === 'show files' ||
        input === 'list files' ||
        /^покажи\s+(мне\s+)?файлы?$/i.test(input) ||
        /^list\s+files?$/i.test(input)) {
      toolCalls.push({
        tool: 'listFiles',
        parameters: { path: '.' }
      });
    } else if (/создай|create/.test(input) && (/файл|file/.test(input) || /\.(js|ts|json|md|txt|html|css)/.test(input))) {
      // Extract filename from various patterns
      const patterns = [
        /in\s+(\S+\.js)/i,                  // in server.js
        /file\s+(\S+)\s+with/i,              // file test.txt with
        /файл\s+(\S+)\s+(?:с|и)/i,          // файл test.txt с/и
        /create\s+file\s+(\S+)\s+with/i,    // create file test.txt with
        /создай\s+файл\s+(\S+)\s+и/i,       // создай файл test.txt и
        /['"](.*?)['"]\s+with/i,            // "test.txt" with
      ];
      
      let filename = 'newfile.txt';
      let content = '';
      
      for (const pattern of patterns) {
        const match = originalInput.match(pattern);
        if (match) {
          filename = match[1];
          break;
        }
      }
      
      // Check if it's an Express server request
      if (/express\s*server/i.test(input) || (/server\.js/i.test(input) && /hello\s*world/i.test(input))) {
        content = `const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(\`Server is running on http://localhost:\${PORT}\`);
});`;
      } else {
        // Extract content - use original input to preserve case
        // But stop at "then" for multi-step requests
        let processedInput = originalInput;
        if (/\s+then\s+/i.test(processedInput)) {
          processedInput = processedInput.split(/\s+then\s+/i)[0];
        }
        
        // More flexible content matching
        const contentPatterns = [
          /(?:напиши\s+там|write\s+there)\s+['"](.+?)['"]$/i,     // напиши там "Hello"
          /(?:и\s+напиши\s+там)\s+['"](.+?)['"]$/i,               // и напиши там "Hello"
          /(?:with\s+content|с\s+содержимым)\s+['"]?(.+?)['"]?$/i,
          /(?:with\s+this\s+code:)\s+(.+)$/i,
          /(?:with)\s+['"](.+?)['"]$/i
        ];
        
        for (const pattern of contentPatterns) {
          const match = processedInput.match(pattern);
          if (match) {
            content = match[1];
            break;
          }
        }
        
        if (!content && processedInput.toLowerCase().includes('with this code:')) {
          content = originalInput.split(/with this code:/i)[1].trim();
        }
      }
      
      toolCalls.push({
        tool: 'writeFile',
        parameters: { 
          path: filename, 
          content: content 
        }
      });
    } else if (/прочитай|read|открой/.test(input)) {
      // Extract filename from various patterns
      const patterns = [
        /read\s+(?:the\s+)?file\s+(\S+)/i,     // read the file demo.txt
        /прочитай\s+файл\s+(\S+)/i,           // прочитай файл demo.txt
        /открой\s+(\S+)/i,                     // открой demo.txt
        /['"](.*?)['"]/,                       // "demo.txt"
        /(\S+\.\w+)/                          // any filename with extension
      ];
      
      let filename = null;
      for (const pattern of patterns) {
        const match = originalInput.match(pattern);
        if (match) {
          filename = match[1];
          break;
        }
      }
      
      if (filename) {
        toolCalls.push({
          tool: 'readFile',
          parameters: { path: filename }
        });
      }
    } else if (/удали|delete|remove/.test(input) && (/файл|file/.test(input) || /\.(txt|js|json|md|html|css)/.test(input))) {
      // Extract filename for deletion
      const patterns = [
        /delete\s+(\S+)/i,
        /remove\s+(\S+)/i,
        /удали\s+(\S+)/i,
        /['"](.*?)['"]/,
        /(\S+\.\w+)/
      ];
      
      let filename = null;
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
          filename = match[1];
          break;
        }
      }
      
      if (filename) {
        toolCalls.push({
          tool: 'deleteFile',
          parameters: { path: filename }
        });
      }
    }

    if (toolCalls.length > 0) {
      return { toolCalls };
    }

    // If we're in file context but no specific operation, list files
    if (/файл|папк|folder|directory/.test(input)) {
      return {
        toolCalls: [{
          tool: 'listFiles',
          parameters: { path: '.' }
        }]
      };
    }

    return {
      message: 'I can list files, read, write, edit or delete them. What would you like to do?'
    };
  }
}