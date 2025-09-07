import { LMStudioProvider } from '../providers/lmstudio.js';

interface ExecutionContext {
  userInput: string;
  intent: any;
  action: any;
  previousResults?: any[];
  systemInfo?: any;
  conversationHistory?: any[];
}

interface ExecutionAdaptation {
  shouldAdapt: boolean;
  reason?: string;
  adaptedParameters?: Record<string, any>;
  additionalContext?: string;
}

export class ContextAwareExecutor {
  constructor(private provider: LMStudioProvider) {}

  async adaptExecution(context: ExecutionContext): Promise<ExecutionAdaptation> {
    // Dynamically adapt execution based on context
    const adaptationPrompt = `
Analyze this execution context and determine if adaptation is needed:

USER REQUEST: "${context.userInput}"
INTENT: ${JSON.stringify(context.intent)}
PLANNED ACTION: ${JSON.stringify(context.action)}
${context.previousResults ? `PREVIOUS RESULTS: ${JSON.stringify(context.previousResults)}` : ''}
${context.systemInfo ? `SYSTEM: ${context.systemInfo.name} (${context.systemInfo.platform})` : ''}

ADAPTATION PRINCIPLES:
1. CONTEXT SENSITIVITY
   - Consider user's actual goal vs literal request
   - Account for system-specific requirements
   - Learn from previous results

2. PARAMETER REFINEMENT
   - Ensure parameters match system capabilities
   - Add missing but implied parameters
   - Correct potentially harmful parameters

3. SAFETY CHECKS
   - Prevent destructive operations without confirmation
   - Ensure commands are appropriate for the OS
   - Add safeguards where needed

EXAMPLES:
- User: "show files" on Windows → adapt "ls" to "dir"
- User: "delete everything" → add confirmation or limit scope
- User: "check weather" without location → use IP-based location
- User: "run server" → ensure port is available first

RESPOND IN JSON:
{
  "shouldAdapt": true/false,
  "reason": "explanation if adapting",
  "adaptedParameters": {
    "param": "new_value"
  },
  "additionalContext": "any extra info for execution"
}

Analyze and respond:`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'You are a context-aware execution adapter. Ensure safe and appropriate command execution.'
        },
        { role: 'user', content: adaptationPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch {
      // No adaptation by default
      return { shouldAdapt: false };
    }
  }

  async interpretResults(results: any, context: ExecutionContext): Promise<{
    success: boolean;
    interpretation: string;
    nextSteps?: string[];
    userMessage: string;
  }> {
    const interpretationPrompt = `
Interpret these execution results in the context of the user's request:

USER WANTED: "${context.userInput}"
ACTION TAKEN: ${JSON.stringify(context.action)}
RESULTS: ${JSON.stringify(results)}

INTERPRETATION TASKS:
1. Determine if the goal was achieved
2. Extract key information from results
3. Identify any issues or unexpected outcomes
4. Suggest follow-up actions if needed
5. Create a user-friendly explanation

Consider:
- Did we get what the user wanted?
- Are there errors that need addressing?
- Is there additional information that would be helpful?
- Should we suggest next steps?

RESPOND IN JSON:
{
  "success": true/false,
  "interpretation": "technical analysis",
  "nextSteps": ["step1", "step2"],
  "userMessage": "friendly explanation for the user in their language"
}`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'Interpret technical results and provide user-friendly explanations.'
        },
        { role: 'user', content: interpretationPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch {
      return {
        success: true,
        interpretation: 'Results processed',
        userMessage: 'Operation completed. ' + JSON.stringify(results)
      };
    }
  }

  async suggestFollowUp(
    currentResults: any,
    userGoal: string,
    completedActions: any[]
  ): Promise<{
    suggestions: Array<{
      description: string;
      action: any;
      reason: string;
    }>;
    explanation: string;
  }> {
    const suggestionPrompt = `
Based on what we've done so far, suggest helpful follow-up actions:

USER'S GOAL: "${userGoal}"
COMPLETED ACTIONS: ${JSON.stringify(completedActions)}
CURRENT RESULTS: ${JSON.stringify(currentResults)}

Generate intelligent follow-up suggestions that:
1. Build on what we've learned
2. Address any gaps in achieving the goal
3. Provide additional value
4. Anticipate user needs

RESPOND IN JSON:
{
  "suggestions": [
    {
      "description": "what this does",
      "action": {
        "tool": "toolName",
        "parameters": {}
      },
      "reason": "why this is helpful"
    }
  ],
  "explanation": "overall explanation of suggestions"
}`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'Generate intelligent follow-up suggestions based on context and results.'
        },
        { role: 'user', content: suggestionPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch {
      return {
        suggestions: [],
        explanation: 'No follow-up suggestions available.'
      };
    }
  }
}