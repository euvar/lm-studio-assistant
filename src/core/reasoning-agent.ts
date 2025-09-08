import { LMStudioProvider, ChatMessage } from '../providers/lmstudio.js';
import chalk from 'chalk';
import { LearningSystem } from './learning-system.js';

export interface ReasoningStep {
  thought: string;
  action?: string;
  toolCall?: {
    tool: string;
    parameters: any;
  };
  observation?: string;
}

export interface ReasoningResult {
  steps: ReasoningStep[];
  finalAnswer: string;
  toolCalls: Array<{ tool: string; parameters: any }>;
}

export class ReasoningAgent {
  private provider: LMStudioProvider;
  private learningSystem: LearningSystem;

  constructor(provider: LMStudioProvider) {
    this.provider = provider;
    this.learningSystem = new LearningSystem();
    this.learningSystem.initialize().catch(console.error);
  }

  async reason(userInput: string, availableTools: string): Promise<ReasoningResult> {
    // Get model name for adaptive prompting
    const modelName = this.provider.getModel() || 'unknown';

    let reasoningPrompt = this.generateCleanPrompt(userInput, availableTools);
    
    // Apply learning-based adaptations
    reasoningPrompt = this.learningSystem.generateAdaptivePrompt(modelName, reasoningPrompt);

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'You are a reasoning assistant. Think step by step.' },
        { role: 'user', content: reasoningPrompt }
      ]);

      if (process.env.DEBUG) {
        console.log(chalk.dim('Raw reasoning response:'), response.content);
      }
      
      const result = this.parseReasoningResponse(response.content);
      
      // Record interaction for learning
      const expectedBehavior = this.conversationNeedsTools(userInput) ? 'tools' : 'no-tools';
      const actualBehavior = result.toolCalls.length > 0 ? 'tools' : 'no-tools';
      
      await this.learningSystem.recordInteraction(
        userInput,
        expectedBehavior,
        actualBehavior,
        modelName
      );
      
      // Validate the result - ensure we have a proper response
      if (!result.finalAnswer && result.toolCalls.length === 0) {
        // If no answer and no tools, model didn't generate proper response
        // Return empty to let assistant.ts handle fallback generation
        result.finalAnswer = '';
      }
      
      return result;
    } catch (error) {
      // Fallback - return empty answer to let the model generate response naturally
      return {
        steps: [{
          thought: 'Processing request',
          action: 'Generating response'
        }],
        finalAnswer: '',
        toolCalls: []
      };
    }
  }

  private parseReasoningResponse(content: string): ReasoningResult {
    const steps: ReasoningStep[] = [];
    const toolCalls: Array<{ tool: string; parameters: any }> = [];
    let finalAnswer = '';

    // Try multiple parsing strategies for different model outputs
    
    // Strategy 1: Original THOUGHT/ACTION/TOOL format
    const thoughtMatches = content.match(/THOUGHT:\s*(.+?)(?=\n|$)/gi);
    if (thoughtMatches) {
      thoughtMatches.forEach(match => {
        steps.push({ thought: match.replace(/^THOUGHT:\s*/i, '').trim() });
      });
    }

    // Strategy 2: REASONING/ANSWER format
    const reasoningMatch = content.match(/REASONING:\s*([\s\S]+?)(?=\nANSWER:|$)/i);
    if (reasoningMatch) {
      steps.push({ thought: reasoningMatch[1].trim() });
    }
    const answerMatch = content.match(/(?:ANSWER|RESPONSE|DIRECT_ANSWER|MESSAGE):\s*([\s\S]+?)(?=$|\nREASONING:|$)/i);
    if (answerMatch) {
      finalAnswer = answerMatch[1].trim();
    }

    // Strategy 3: ANALYSIS format
    const analysisMatch = content.match(/ANALYSIS:\s*(\w+)/i);
    if (analysisMatch) {
      const analysisType = analysisMatch[1].toUpperCase();
      if (analysisType === 'CHAT' || analysisType === 'INFO' || analysisType === 'NO_TOOLS_NEEDED') {
        // No tools needed
        const responseMatch = content.match(/(?:RESPONSE|REPLY):\s*([\s\S]+?)(?=$|\nANALYSIS:|$)/i);
        if (responseMatch) {
          finalAnswer = responseMatch[1].trim();
        }
      }
    }

    // Extract tool calls - try multiple formats
    const toolPatterns = [
      /TOOL:\s*(\{[\s\S]+?\})/i,
      /TOOL_CALL:\s*(\{[\s\S]+?\})/i,
      /USE_TOOL:\s*(\{[\s\S]+?\})/i,
      /TOOL_CONFIG:\s*(\{[\s\S]+?\})/i,
      /ACTION:\s*(\{[\s\S]+?\})/i,
      /\{"tool":\s*"[^"]+",\s*"parameters":\s*\{[^}]*\}\}/g,
      /\{"function":\s*"[^"]+",\s*"arguments":\s*\{[^}]*\}\}/g,
      /\{"name":\s*"[^"]+",\s*"params":\s*\{[^}]*\}\}/g
    ];

    for (const pattern of toolPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          try {
            // Extract JSON from the match
            const jsonStr = match.replace(/^[^{]*/, '');
            const parsed = JSON.parse(jsonStr);
            
            // Normalize to standard format
            let normalizedTool: any = {};
            
            if (parsed.tool && parsed.parameters) {
              normalizedTool = parsed;
            } else if (parsed.function && parsed.arguments) {
              normalizedTool = { tool: parsed.function, parameters: parsed.arguments };
            } else if (parsed.name && parsed.params) {
              normalizedTool = { tool: parsed.name, parameters: parsed.params };
            } else if (parsed.tool && parsed.args) {
              normalizedTool = { tool: parsed.tool, parameters: parsed.args };
            } else if (parsed.name && (parsed.path || parsed.content || parsed.search)) {
              // Handle direct parameter format
              const params: any = {};
              if (parsed.path) params.path = parsed.path;
              if (parsed.content) params.content = parsed.content;
              if (parsed.search) params.search = parsed.search;
              if (parsed.replace) params.replace = parsed.replace;
              if (parsed.all) params.all = parsed.all;
              normalizedTool = { tool: parsed.name, parameters: params };
            }
            
            if (normalizedTool.tool) {
              toolCalls.push(normalizedTool);
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      }
    }

    // Final answer patterns
    if (!finalAnswer) {
      const finalPatterns = [
        /FINAL ANSWER:\s*([\s\S]*?)(?=$|\n(?:THOUGHT|REASONING):|$)/i,
        /FINAL_ANSWER:\s*([\s\S]*?)(?=$|\n(?:THOUGHT|REASONING):|$)/i,
        /^ANSWER:\s*([\s\S]*?)(?=$|\n(?:REASONING|USE_TOOL):|$)/im,
        /\nANSWER:\s*([\s\S]*?)(?=$|\n(?:REASONING|USE_TOOL):|$)/im
      ];
      
      for (const pattern of finalPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          finalAnswer = match[1].trim();
          break;
        }
      }
    }

    // If no steps recorded, add a generic one
    if (steps.length === 0) {
      steps.push({ thought: 'Processed request' });
    }

    return {
      steps,
      finalAnswer,
      toolCalls
    };
  }

  formatReasoningSteps(steps: ReasoningStep[]): string {
    if (steps.length === 0) return '';
    
    let output = chalk.dim('\n🤔 Reasoning:\n');
    
    steps.forEach((step, index) => {
      if (step.thought) {
        output += chalk.dim(`   ${index + 1}. Thought: ${step.thought}\n`);
      }
      if (step.action) {
        output += chalk.dim(`      → Action: ${step.action}\n`);
      }
      if (step.observation) {
        output += chalk.dim(`      ✓ Result: ${step.observation}\n`);
      }
    });
    
    return output;
  }

  async getLearningReport(): Promise<string> {
    return await this.learningSystem.generateReport();
  }

  /**
   * Generate clean prompt without hardcoded patterns
   */
  private generateCleanPrompt(userInput: string, availableTools: string): string {
    return `You are an AI assistant with access to tools. Based on the user's request, determine if you need to use any tools.

User Input: "${userInput}"

Available Tools:
${availableTools}

Instructions:
1. Analyze what the user is asking for
2. Determine if any tools are needed
3. If tools are needed, specify which ones and with what parameters
4. If no tools are needed, just provide a direct response

IMPORTANT: Never output REASONING: or ANALYSIS: prefixes. Just provide your analysis and decision.

Remember:
- Use tools only when the user explicitly asks for actions requiring them
- For general conversation, greetings, or knowledge questions, no tools are needed
- When in doubt, prefer not using tools unless clearly necessary`;
  }
  
  /**
   * Check if conversation needs tools
   */
  conversationNeedsTools(input: string): boolean {
    // This is a simple heuristic - in a clean system, the LLM decides
    return false;
  }

}