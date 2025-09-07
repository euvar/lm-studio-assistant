import { LMStudioProvider } from '../providers/lmstudio.js';
import { ToolCall } from '../tools/index.js';

interface ActionContext {
  intent: any;
  userInput: string;
  availableTools: string[];
  systemInfo?: any;
  conversationHistory?: any[];
}

interface ActionPlan {
  approach: 'single' | 'multi' | 'clarification' | 'conversation';
  actions: Action[];
  reasoning: string;
  message?: string;
}

interface Action {
  tool: string;
  parameters: Record<string, any>;
  description: string;
  expectedOutcome: string;
}

export class DynamicActionMapper {
  constructor(private provider: LMStudioProvider) {}

  async mapIntentToActions(context: ActionContext): Promise<ActionPlan> {
    const mappingPrompt = `
You are a dynamic action mapper that translates user intents into concrete actions.

USER INTENT:
${JSON.stringify(context.intent, null, 2)}

USER INPUT: "${context.userInput}"

AVAILABLE TOOLS:
${context.availableTools.map(t => `- ${t}`).join('\n')}

${context.systemInfo ? `SYSTEM INFO: ${JSON.stringify(context.systemInfo)}` : ''}

MAPPING PRINCIPLES:
1. SEMANTIC REASONING
   - Understand the goal, not the words
   - Consider context and implications
   - Choose tools based on capability match

2. TOOL SELECTION LOGIC
   Map intents to tools based on semantic purpose:
   
   - information_request about internet/world → webSearch
   - information_request about system → bash (with info commands)
   - action_execution on system → bash (with action commands)
   - file_operation create → writeFile
   - file_operation read → readFile
   - file_operation list → listFiles
   - web_search → webSearch
   - problem_solving → multi-step with diagnostics
   - creative_task → appropriate creation tool
   - analysis_task → analyzeProject or appropriate analysis

3. PARAMETER GENERATION
   Generate parameters based on:
   - Extracted entities from intent
   - Semantic understanding of request
   - System-appropriate commands
   - Safe and effective approaches

4. MULTI-STEP PLANNING
   For complex intents:
   - Break into logical steps
   - Ensure proper sequencing
   - Consider dependencies

RESPONSE FORMAT:
{
  "approach": "single|multi|clarification|conversation",
  "actions": [
    {
      "tool": "exact_tool_name",
      "parameters": {
        "param": "value"
      },
      "description": "what this does",
      "expectedOutcome": "what we expect"
    }
  ],
  "reasoning": "explain mapping logic",
  "message": "only for conversation/clarification"
}

EXAMPLES:
- Intent: information_request about weather
  → tool: webSearch, parameters: {query: "weather in [location]"}
  
- Intent: system_operation to check processes
  → tool: bash, parameters: {command: "ps aux | head -20"}
  
- Intent: file_operation to create
  → tool: writeFile, parameters: {path: "[filename]", content: "[content]"}

Map the intent to appropriate actions:`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'You are an intelligent action mapper. Translate intents to executable actions through semantic understanding.'
        },
        { role: 'user', content: mappingPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch (error) {
      return this.getFallbackPlan(context);
    }
  }

  async optimizeActions(plan: ActionPlan, context: ActionContext): Promise<ActionPlan> {
    // Optimize the action plan based on context
    const optimizationPrompt = `
Review and optimize this action plan:
${JSON.stringify(plan, null, 2)}

Context:
- User said: "${context.userInput}"
- Intent confidence: ${context.intent.confidence}

Optimization criteria:
1. Efficiency: Can we achieve the same result with fewer steps?
2. Safety: Are all actions safe and reversible?
3. Clarity: Will the user understand what's happening?
4. Completeness: Does this fully address the user's need?

If the plan is good, return it unchanged.
If it needs optimization, return an improved version.

Respond with the optimized plan in the same JSON format.`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'Optimize action plans for efficiency and safety.' },
        { role: 'user', content: optimizationPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch {
      return plan; // Return original if optimization fails
    }
  }

  private getFallbackPlan(context: ActionContext): ActionPlan {
    // Simple fallback based on intent type
    const intentType = context.intent.type;

    switch (intentType) {
      case 'web_search':
        return {
          approach: 'single',
          actions: [{
            tool: 'webSearch',
            parameters: { query: context.userInput },
            description: 'Search the web',
            expectedOutcome: 'Web search results'
          }],
          reasoning: 'Fallback to direct web search'
        };

      case 'file_operation':
        return {
          approach: 'single',
          actions: [{
            tool: 'listFiles',
            parameters: { path: '.' },
            description: 'List current directory',
            expectedOutcome: 'File listing'
          }],
          reasoning: 'Fallback to directory listing'
        };

      default:
        return {
          approach: 'conversation',
          actions: [],
          reasoning: 'Fallback to conversation',
          message: 'I understand you want to ' + intentType.replace(/_/g, ' ') + 
                   '. Could you provide more details about what you need?'
        };
    }
  }

  async validateActions(actions: Action[], availableTools: string[]): Promise<{
    valid: boolean;
    errors: string[];
    suggestions: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    for (const action of actions) {
      // Check if tool exists
      if (!availableTools.includes(action.tool)) {
        errors.push(`Unknown tool: ${action.tool}`);
        
        // Suggest similar tools
        const similar = this.findSimilarTool(action.tool, availableTools);
        if (similar) {
          suggestions.push(`Did you mean '${similar}' instead of '${action.tool}'?`);
        }
      }

      // Validate parameters
      if (!action.parameters || Object.keys(action.parameters).length === 0) {
        if (action.tool !== 'help' && action.tool !== 'listTools') {
          errors.push(`Missing parameters for tool: ${action.tool}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions
    };
  }

  private findSimilarTool(toolName: string, availableTools: string[]): string | null {
    // Simple similarity check
    const lower = toolName.toLowerCase();
    
    for (const tool of availableTools) {
      if (tool.toLowerCase().includes(lower) || lower.includes(tool.toLowerCase())) {
        return tool;
      }
    }

    return null;
  }
}