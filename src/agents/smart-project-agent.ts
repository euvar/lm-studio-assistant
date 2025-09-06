import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { LMStudioProvider } from '../providers/lmstudio.js';

export class SmartProjectAgent extends BaseAgent {
  name = 'smart-project';
  description = 'Intelligently handles project-related questions and analysis';
  capabilities = ['project understanding', 'context-aware responses', 'project insights'];

  constructor(private provider: LMStudioProvider) {
    super();
  }

  async canHandle(context: AgentContext): Promise<boolean> {
    const input = context.userInput.toLowerCase();
    
    // This agent handles questions that seem to be about the current context/project
    // even if they don't explicitly say "project"
    const contextualPatterns = [
      // Direct project questions
      /что.*дума.*проект|what.*think.*project/,
      /расскаж.*проект|tell.*about.*project/,
      /этот проект|this project/,
      
      // Implicit project questions (in file context)
      /что ты.*дума|what do you.*think/,
      /что.*видишь|what.*see/,
      /что это|what is this/,
      /опиши.*это|describe.*this/,
      
      // Questions about code/structure
      /какой.*код|what.*code/,
      /какая.*структур|what.*structure/,
      /для чего.*это|what.*for/
    ];
    
    // Check if we're in a project directory context
    const hasProjectContext = context.metadata?.lastFileOperation || 
                             context.conversationHistory.some(msg => 
                               msg.content.includes('listFiles') || 
                               msg.content.includes('файл') ||
                               msg.content.includes('папк'));
    
    return contextualPatterns.some(pattern => pattern.test(input)) || 
           (hasProjectContext && /что.*дума|расскаж|опиши/.test(input));
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    // First analyze the project to get context
    const toolCalls = [{
      tool: 'analyzeProject',
      parameters: { path: '.' }
    }];

    // Add metadata to help the model understand the user wants an opinion/analysis
    return {
      toolCalls,
      metadata: {
        userIntent: 'project_analysis_and_opinion',
        instruction: 'After analyzing the project, provide insights and opinions about what you found'
      }
    };
  }
}