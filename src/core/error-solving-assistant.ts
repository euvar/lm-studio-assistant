import { ReasoningAgent } from './reasoning-agent.js';
import { LMStudioProvider } from '../providers/lmstudio.js';

export class ErrorSolvingAssistant {
  private reasoningAgent: ReasoningAgent;
  private provider: LMStudioProvider;
  
  constructor(provider: LMStudioProvider) {
    this.provider = provider;
    this.reasoningAgent = new ReasoningAgent(provider);
  }
  
  /**
   * Enhanced reasoning for error solving tasks
   */
  async solveError(userInput: string, availableTools: string): Promise<any> {
    // Check for specific error-solving patterns
    const patterns = {
      run: /запусти|выполни|run|execute/i,
      fix: /исправь|fix|repair|решить/i,
      debug: /debug|отладка|найди ошибку/i,
      analyze: /анализ|analyze|что за ошибка/i
    };
    
    let enhancedPrompt = userInput;
    
    // Enhance the prompt based on detected patterns
    if (patterns.run.test(userInput)) {
      // Extract filename
      const fileMatch = userInput.match(/(\S+\.[jt]s)/);
      if (fileMatch) {
        enhancedPrompt = `Run JavaScript file ${fileMatch[1]} and show any errors`;
      }
    } else if (patterns.fix.test(userInput)) {
      enhancedPrompt = `Fix the error in the file: ${userInput}`;
    } else if (patterns.analyze.test(userInput)) {
      enhancedPrompt = `Analyze the error and suggest fixes: ${userInput}`;
    }
    
    // Use enhanced reasoning
    const result = await this.reasoningAgent.reason(enhancedPrompt, availableTools);
    
    // If no tools were selected but we detect error-solving intent, force appropriate tools
    if (result.toolCalls.length === 0) {
      if (patterns.run.test(userInput)) {
        const fileMatch = userInput.match(/(\S+\.[jt]s)/);
        if (fileMatch) {
          result.toolCalls.push({
            tool: 'runJavaScript',
            parameters: { path: fileMatch[1] }
          });
        }
      } else if (patterns.fix.test(userInput) && userInput.includes('файл')) {
        // Extract filename for fixing
        const fileMatch = userInput.match(/файл[е]?\s+(\S+)/);
        if (fileMatch) {
          result.toolCalls.push({
            tool: 'readFile',
            parameters: { path: fileMatch[1] }
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Analyze error output and suggest fixes
   */
  analyzeErrorOutput(errorText: string): { tool: string; parameters: any }[] {
    const suggestions = [];
    
    // Check for common Node.js errors
    if (errorText.includes('Cannot find module')) {
      const moduleMatch = errorText.match(/Cannot find module\s*'([^']+)'/);
      if (moduleMatch) {
        suggestions.push({
          tool: 'bash',
          parameters: { command: `npm install ${moduleMatch[1]}` }
        });
      }
    }
    
    if (errorText.includes('fs.readFile is not a function')) {
      suggestions.push({
        tool: 'editFile',
        parameters: {
          path: 'broken-code.js',
          search: "const fs = require('fs')",
          replace: "const fs = require('fs').promises"
        }
      });
    }
    
    if (errorText.includes('ENOENT: no such file or directory')) {
      const pathMatch = errorText.match(/ENOENT:.*?'([^']+)'/);
      if (pathMatch) {
        suggestions.push({
          tool: 'bash',
          parameters: { command: `mkdir -p ${pathMatch[1].split('/').slice(0, -1).join('/')}` }
        });
      }
    }
    
    return suggestions;
  }
}