import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';

export class CodeAgent extends BaseAgent {
  name = 'code-execution';
  description = 'Handles code execution and debugging';
  capabilities = ['run code', 'execute commands', 'debug errors', 'analyze projects'];

  async canHandle(context: AgentContext): Promise<boolean> {
    const input = context.userInput.toLowerCase();
    
    // Skip if this is clearly a file creation request
    if (/create\s+(?:a\s+)?file/.test(input)) {
      return false;
    }
    
    // Handle TypeScript/code file listing
    if (/typescript|\.ts|типскрипт/.test(input) && /file|файл|show|покаж|list|список/.test(input)) {
      return true;
    }
    
    // Let orchestrator handle most requests with semantic understanding
    // Only handle if explicitly about code execution
    if (input.includes('run') || input.includes('execute') || input.includes('запусти')) {
      return true;
    }
    
    // More comprehensive patterns for project analysis
    const codePatterns = [
      /запусти|выполни|run|execute/,
      /ошибк|error|debug|исправ|fix/,
      /проект|project/,
      /анализ|analyze|analysis/,
      /команд|command|bash|terminal/,
      /код|code|скрипт|script/,
      // Questions about the project
      /что.*дума.*проект|what.*think.*project/,
      /расскаж.*проект|tell.*about.*project/,
      /опиши.*проект|describe.*project/,
      /этот.*проект|this.*project/,
      /данн.*проект|current.*project/
    ];
    
    return codePatterns.some(pattern => pattern.test(input));
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    const input = context.userInput.toLowerCase();
    const toolCalls = [];

    // Check if this is asking about the current project
    const isAskingAboutProject = /что.*дума|расскаж|опиши|what.*think|tell.*about|describe/.test(input) && 
                                 /проект|project/.test(input);
    
    if (isAskingAboutProject || /анализ.*проект|analyze.*project|этот.*проект|this.*project/.test(input)) {
      // Always analyze project first for these questions
      toolCalls.push({
        tool: 'analyzeProject',
        parameters: { path: '.' }
      });
    } else if (/запусти|run|execute|выполни/.test(input)) {
      // Extract command or script name
      const commandMatch = input.match(/['"](.*?)['"]/);
      if (commandMatch) {
        const command = commandMatch[1];
        
        if (command.endsWith('.js')) {
          toolCalls.push({
            tool: 'runJavaScript',
            parameters: { path: command }
          });
        } else {
          toolCalls.push({
            tool: 'bash',
            parameters: { command }
          });
        }
      } else {
        return {
          message: 'Please specify what to run in quotes, like: run "npm test"'
        };
      }
    } else if (/ошибк|error|debug|исправ|fix/.test(input) && /синтаксис|syntax/.test(input)) {
      // Fix syntax error in a file
      const filenameMatch = input.match(/(?:in|в)\s+(\S+\.js)/);
      const filename = filenameMatch ? filenameMatch[1] : null;
      
      if (filename) {
        toolCalls.push({
          tool: 'fixSyntaxError',
          parameters: { path: filename }
        });
      } else {
        // Look for any .js files mentioned
        const jsFileMatch = input.match(/(\S+\.js)/);
        if (jsFileMatch) {
          toolCalls.push({
            tool: 'fixSyntaxError',
            parameters: { path: jsFileMatch[1] }
          });
        }
      }
    } else if (/typescript|\.ts/.test(input) && /file|файл|show|покаж|list/.test(input)) {
      // Show TypeScript files
      let folder = 'src';
      const folderMatch = input.match(/in\s+(\S+)\s+folder/i);
      if (folderMatch) {
        folder = folderMatch[1];
      }
      
      toolCalls.push({
        tool: 'bash',
        parameters: { command: `find ${folder} -name "*.ts" -type f 2>/dev/null | head -20` }
      });
    } else if (/ошибк|error|debug/.test(input)) {
      // This might need context from previous messages
      return {
        message: 'Please show me the error message or describe the issue',
        nextAgent: 'conversational' // Switch to conversational to get more info
      };
    }

    if (toolCalls.length > 0) {
      return { toolCalls };
    }

    return {
      message: 'I can help with running code, analyzing projects, or debugging. What would you like me to do?'
    };
  }
}