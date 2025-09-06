import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';

export class SearchAgent extends BaseAgent {
  name = 'web-search';
  description = 'Handles web searches and information retrieval';
  capabilities = ['web search', 'find information', 'current data'];

  async canHandle(context: AgentContext): Promise<boolean> {
    const input = context.userInput.toLowerCase();
    
    // Skip if this is a terminal/system command
    if (/directory|директор|папк|process|процесс|terminal|терминал|command|команд/.test(input)) {
      return false;
    }
    
    const searchPatterns = [
      /найди|найти|поищи|поискать|search|find|look up/,
      /погода|weather/,
      /курс|price|цена/,
      /новости|news/,
      /что такое|what is|define/,
      /какая.*сейчас|what.*now/,
      /текущ|current/,
      /актуальн|latest|recent/
    ];
    
    // Also handle questions that need current information
    const needsCurrentInfo = searchPatterns.some(pattern => pattern.test(input));
    
    // Check for location-based queries (weather in X)
    const locationQuery = /погода.*в\s+(\S+)|weather.*in\s+(\S+)/i.test(input);
    
    return needsCurrentInfo || locationQuery;
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    return {
      toolCalls: [{
        tool: 'webSearch',
        parameters: { 
          query: context.userInput 
        }
      }]
    };
  }
}