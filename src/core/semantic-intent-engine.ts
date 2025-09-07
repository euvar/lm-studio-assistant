import { LMStudioProvider } from '../providers/lmstudio.js';

interface Intent {
  type: string;
  confidence: number;
  entities: Record<string, any>;
  reasoning: string;
}

interface IntentContext {
  input: string;
  conversationHistory?: any[];
  systemCapabilities?: string[];
  previousIntent?: Intent;
}

export class SemanticIntentEngine {
  constructor(private provider: LMStudioProvider) {}

  async understand(context: IntentContext): Promise<Intent> {
    const { input, conversationHistory = [], systemCapabilities = [] } = context;

    // Build a comprehensive understanding prompt
    const understandingPrompt = `
You are an advanced intent understanding system that uses semantic analysis, not pattern matching.

TASK: Understand the user's true intent through deep semantic analysis.

USER INPUT: "${input}"

${conversationHistory.length > 0 ? `RECENT CONVERSATION:
${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

${context.previousIntent ? `PREVIOUS INTENT: ${JSON.stringify(context.previousIntent)}` : ''}

ANALYSIS FRAMEWORK:
1. SEMANTIC DECOMPOSITION
   - What is the core subject/topic?
   - What action does the user want?
   - What is the expected outcome?
   - What context clues are present?

2. INTENT CLASSIFICATION
   Based on semantic meaning, classify into one of these intents:
   - information_request: User wants to know something
   - action_execution: User wants to do something
   - file_operation: User wants to work with files
   - system_operation: User wants to interact with the system
   - web_search: User wants information from the internet
   - conversation: User wants to chat or discuss
   - problem_solving: User has a problem to solve
   - creative_task: User wants to create something
   - analysis_task: User wants to analyze something
   - navigation: User wants to navigate or find something

3. ENTITY EXTRACTION
   Extract key entities:
   - subjects: Main topics or objects
   - actions: Verbs or desired operations
   - locations: Places, directories, URLs
   - constraints: Conditions, filters, specifications
   - temporal: Time-related information
   - quantities: Numbers, amounts, sizes

4. CONFIDENCE ASSESSMENT
   Rate confidence based on:
   - Clarity of expression
   - Presence of ambiguity
   - Context availability
   - Specificity of request

RESPOND IN JSON:
{
  "type": "intent_type_from_list_above",
  "confidence": 0.0-1.0,
  "entities": {
    "subjects": [],
    "actions": [],
    "locations": [],
    "constraints": [],
    "temporal": [],
    "quantities": []
  },
  "reasoning": "explain your semantic understanding"
}

Remember: Focus on WHAT the user wants to achieve, not HOW they expressed it.
`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'You are a semantic understanding engine. Analyze user intent through meaning, not patterns.'
        },
        { role: 'user', content: understandingPrompt }
      ]);

      // Clean and parse response
      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch (error) {
      // Fallback intent
      return {
        type: 'conversation',
        confidence: 0.3,
        entities: {},
        reasoning: 'Failed to parse intent, defaulting to conversation'
      };
    }
  }

  async clarifyIntent(intent: Intent, userInput: string): Promise<string> {
    if (intent.confidence >= 0.8) {
      return ''; // No clarification needed
    }

    const clarificationPrompt = `
The user said: "${userInput}"

I understood this as: ${intent.type} (confidence: ${intent.confidence})
Reasoning: ${intent.reasoning}

The confidence is low. Generate a natural clarifying question to better understand what the user wants.
Make it conversational and specific to what's unclear.

Examples:
- "Do you want me to search for that information online or check your local files?"
- "Are you asking me to create a new file or modify an existing one?"
- "Should I execute this command or just explain what it does?"

Generate a single clarifying question:`;

    const response = await this.provider.chat([
      { role: 'system', content: 'Generate natural clarifying questions.' },
      { role: 'user', content: clarificationPrompt }
    ]);

    return response.content.trim();
  }

  async refineIntent(originalIntent: Intent, clarification: string): Promise<Intent> {
    const refinePrompt = `
Original user intent: ${JSON.stringify(originalIntent)}
User clarification: "${clarification}"

Refine the intent understanding based on this new information.
Increase confidence if the clarification resolves ambiguity.

Respond with updated intent in the same JSON format.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'Refine intent understanding based on clarifications.' },
      { role: 'user', content: refinePrompt }
    ]);

    try {
      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      return JSON.parse(cleanedContent.trim());
    } catch {
      return originalIntent; // Keep original if parsing fails
    }
  }
}