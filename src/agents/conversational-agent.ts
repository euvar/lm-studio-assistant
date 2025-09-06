import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { LMStudioProvider } from '../providers/lmstudio.js';

export class ConversationalAgent extends BaseAgent {
  name = 'conversational';
  description = 'Handles general conversation and chat';
  capabilities = ['chat', 'greetings', 'general questions'];

  constructor(private provider: LMStudioProvider) {
    super();
  }

  async canHandle(context: AgentContext): Promise<boolean> {
    const input = context.userInput.toLowerCase();
    
    // Skip system/action requests
    if (/процесс|process|файл|file|директор|directory|систем|system|погод|weather/.test(input)) {
      return false;
    }
    
    // Skip commands
    if (/покажи|show|создай|create|проверь|check|сколько|how many|удали|delete|remove/.test(input)) {
      return false;
    }
    
    // Skip if contains file extensions
    if (/\.(js|ts|txt|json|md|html|css)/.test(input)) {
      return false;
    }
    
    // Handle only pure conversational
    const conversationalPatterns = [
      /^(привет|hello|hi)$/i,
      /как.*зовут|what.*name/i,
      /кто.*ты|who.*are.*you/i,
      /что.*умеешь|what.*can.*do/i
    ];
    
    return conversationalPatterns.some(p => p.test(input));
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    // First, check if this might be a misunderstood command
    const input = context.userInput.toLowerCase();
    
    // Analyze if user might want an action
    const analysisPrompt = `Analyze if the user is asking for an action or just chatting.

User said: "${context.userInput}"

Is this:
1. A request to perform an action (like checking processes, viewing files, etc)?
2. Just a casual conversation?

If it's an action request, what tool should be used?

Respond in JSON:
{
  "isActionRequest": true/false,
  "suggestedTool": "tool name if action",
  "reason": "why you think this"
}`;

    const analysis = await this.provider.chat([
      { role: 'system', content: 'You are an intent analyzer.' },
      { role: 'user', content: analysisPrompt }
    ]);

    try {
      const parsed = JSON.parse(analysis.content);
      if (parsed.isActionRequest) {
        // Suggest using orchestrator for action
        return {
          message: `I understand you want me to ${context.userInput}. Let me handle that for you.`,
          nextAgent: 'orchestrator'
        };
      }
    } catch (e) {
      // Continue with normal conversation
    }

    // Normal conversational response
    const response = await this.provider.chat([
      { 
        role: 'system', 
        content: 'You are a helpful AI assistant. Respond naturally and conversationally.' 
      },
      { 
        role: 'user', 
        content: context.userInput 
      }
    ]);

    return {
      message: response.content
    };
  }
}