import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { LMStudioProvider } from '../providers/lmstudio.js';

export class SemanticCodeAgent extends BaseAgent {
  name = 'code';
  description = 'Handles code execution, analysis, and debugging through semantic understanding';
  capabilities = ['code execution', 'error fixing', 'project analysis', 'debugging'];

  constructor(private provider?: LMStudioProvider) {
    super();
  }

  async canHandle(context: AgentContext): Promise<boolean> {
    if (!this.provider) {
      // Fallback if no provider - let orchestrator handle
      return false;
    }

    const checkPrompt = `
Analyze if this request is about code execution or analysis:

User said: "${context.userInput}"

Consider:
1. Is this about running or executing code/scripts?
2. Is this about debugging or fixing errors?
3. Is this about analyzing code or projects?
4. Is this about code-related commands?

The code agent should handle requests that need:
- Executing scripts or commands
- Debugging or fixing code errors
- Analyzing project structure
- Running tests or builds

Simple file operations should be handled by file agent.
General questions should be handled by conversational agent.

Respond with just "yes" or "no".`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'You are a routing decision maker. Answer only with yes or no.' },
        { role: 'user', content: checkPrompt }
      ]);
      
      return response.content.toLowerCase().includes('yes');
    } catch {
      return false;
    }
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    if (!this.provider) {
      return {
        message: 'Code agent requires LLM provider for semantic understanding.'
      };
    }

    // Use LLM to understand code-related intent
    const understandingPrompt = `
Analyze this code-related request:

User said: "${context.userInput}"

Determine what code action is needed:
1. Execute a script or command?
2. Debug or fix an error?
3. Analyze a project?
4. Run tests or build?
5. Something else?

Available tools:
- runJavaScript: Execute JavaScript files
- runTypeScript: Execute TypeScript files
- fixSyntaxError: Fix JavaScript syntax errors
- analyzeProject: Analyze project structure
- bash: Run shell commands

Based on semantic understanding, what should we do?

Respond in JSON:
{
  "action": "execute|debug|analyze|test|other",
  "tool": "tool_name",
  "parameters": {},
  "reasoning": "why this action"
}`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'Understand code-related requests semantically.' },
        { role: 'user', content: understandingPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const understanding = JSON.parse(cleanedContent.trim());

      // Build tool calls based on understanding
      const toolCalls = [];
      
      if (understanding.tool && understanding.parameters) {
        toolCalls.push({
          tool: understanding.tool,
          parameters: understanding.parameters
        });
      }

      return {
        toolCalls,
        metadata: {
          agent: 'code',
          action: understanding.action,
          reasoning: understanding.reasoning
        }
      };

    } catch (error) {
      // Fallback response
      return {
        message: 'I can help you with code execution and analysis. Could you clarify what you need?',
        metadata: { agent: 'code', error: true }
      };
    }
  }
}