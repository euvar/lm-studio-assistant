import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { LMStudioProvider } from '../providers/lmstudio.js';
import { SemanticIntentEngine } from '../core/semantic-intent-engine.js';
import { DynamicActionMapper } from '../core/dynamic-action-mapper.js';
import { ToolRegistry } from '../tools/index.js';
import { VisualLogger } from '../utils/visual-logger.js';
import { osDetector } from '../utils/os-detector.js';
import chalk from 'chalk';

export class UniversalOrchestrator extends BaseAgent {
  name = 'universal-orchestrator';
  description = 'Advanced orchestrator using pure LLM understanding without regex or hardcoding';
  capabilities = [
    'semantic intent understanding',
    'dynamic action mapping', 
    'context-aware execution',
    'adaptive learning'
  ];

  private intentEngine: SemanticIntentEngine;
  private actionMapper: DynamicActionMapper;
  private toolRegistry: ToolRegistry;
  private logger: VisualLogger;
  private executionContext: Map<string, any> = new Map();

  constructor(private provider: LMStudioProvider) {
    super();
    this.intentEngine = new SemanticIntentEngine(provider);
    this.actionMapper = new DynamicActionMapper(provider);
    this.toolRegistry = new ToolRegistry();
    this.logger = new VisualLogger();
  }

  async canHandle(context: AgentContext): Promise<boolean> {
    // This orchestrator can potentially handle any request through semantic understanding
    // Let it analyze everything except the most basic operations
    
    const input = context.userInput.trim();
    
    // Skip if it's just a single word command that other agents handle well
    if (input.split(' ').length === 1 && /^(ls|pwd|cd|help|exit)$/i.test(input)) {
      return false;
    }

    // Otherwise, let's understand it semantically
    return true;
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    this.logger.orchestratorStart(`task_${Date.now()}`, 'Understanding request semantically');

    try {
      // Step 1: Semantic Intent Understanding
      const intent = await this.intentEngine.understand({
        input: context.userInput,
        conversationHistory: context.conversationHistory,
        systemCapabilities: this.toolRegistry.getToolNames(),
        previousIntent: this.executionContext.get('lastIntent')
      });

      this.logger.info(`Intent: ${intent.type} (confidence: ${intent.confidence})`, true);
      
      // Store intent for context
      this.executionContext.set('lastIntent', intent);

      // Step 2: Handle low confidence with clarification
      if (intent.confidence < 0.6) {
        const clarification = await this.intentEngine.clarifyIntent(intent, context.userInput);
        if (clarification) {
          return {
            message: clarification,
            metadata: {
              orchestrated: true,
              needsClarification: true,
              intent
            }
          };
        }
      }

      // Step 3: Map Intent to Actions
      const actionPlan = await this.actionMapper.mapIntentToActions({
        intent,
        userInput: context.userInput,
        availableTools: this.toolRegistry.getToolNames(),
        systemInfo: osDetector.getOSInfo(),
        conversationHistory: context.conversationHistory
      });

      this.logger.info(`Approach: ${actionPlan.approach}`, true);

      // Step 4: Validate and Optimize Actions
      if (actionPlan.actions.length > 0) {
        const validation = await this.actionMapper.validateActions(
          actionPlan.actions, 
          this.toolRegistry.getToolNames()
        );

        if (!validation.valid) {
          return {
            message: `I encountered some issues: ${validation.errors.join(', ')}. ${validation.suggestions.join(' ')}`,
            metadata: {
              orchestrated: true,
              validationErrors: validation.errors
            }
          };
        }

        // Optimize the plan
        const optimizedPlan = await this.actionMapper.optimizeActions(actionPlan, {
          intent,
          userInput: context.userInput,
          availableTools: this.toolRegistry.getToolNames(),
          systemInfo: osDetector.getOSInfo()
        });

        // Execute based on approach
        switch (optimizedPlan.approach) {
          case 'single':
            return this.executeSingleAction(optimizedPlan.actions[0], context);
          
          case 'multi':
            return this.executeMultiStepPlan(optimizedPlan, context);
          
          case 'conversation':
            return {
              message: optimizedPlan.message || await this.generateConversationalResponse(intent, context),
              skipOtherAgents: true,
              metadata: {
                orchestrated: true,
                intent,
                approach: 'conversation'
              }
            };
          
          case 'clarification':
            return {
              message: optimizedPlan.message || 'Could you clarify what you need?',
              metadata: {
                orchestrated: true,
                needsClarification: true,
                intent
              }
            };
        }
      }

      // No actions needed - pure conversation
      return {
        message: await this.generateConversationalResponse(intent, context),
        skipOtherAgents: true,
        metadata: {
          orchestrated: true,
          intent
        }
      };

    } catch (error) {
      this.logger.error(`Orchestration failed: ${error}`);
      return this.handleError(error, context);
    }
  }

  private async executeSingleAction(action: any, context: AgentContext): Promise<AgentResponse> {
    this.logger.toolExecution(action.tool, action.parameters);

    return {
      toolCalls: [{
        tool: action.tool,
        parameters: action.parameters
      }],
      metadata: {
        orchestrated: true,
        description: action.description,
        expectedOutcome: action.expectedOutcome
      }
    };
  }

  private async executeMultiStepPlan(plan: any, context: AgentContext): Promise<AgentResponse> {
    this.logger.section('Multi-Step Execution Plan');
    
    // For now, execute the first action and store the rest for follow-up
    const firstAction = plan.actions[0];
    const remainingActions = plan.actions.slice(1);

    this.logger.orchestratorStep(1, plan.actions.length, firstAction.description);

    // Store remaining actions for potential follow-up
    this.executionContext.set('remainingActions', remainingActions);
    this.executionContext.set('currentPlan', plan);

    return {
      toolCalls: [{
        tool: firstAction.tool,
        parameters: firstAction.parameters
      }],
      metadata: {
        orchestrated: true,
        multiStep: true,
        currentStep: 1,
        totalSteps: plan.actions.length,
        description: firstAction.description,
        remainingActions
      }
    };
  }

  private async generateConversationalResponse(intent: any, context: AgentContext): Promise<string> {
    // Generate appropriate response based on intent
    const responsePrompt = `
Based on this semantic understanding, generate a helpful response:

User said: "${context.userInput}"
Intent understood: ${intent.type}
Entities: ${JSON.stringify(intent.entities)}
Reasoning: ${intent.reasoning}

Generate a natural, helpful response that:
1. Acknowledges what you understood
2. Provides helpful information or asks clarifying questions
3. Matches the user's language style and tone
4. Is concise and friendly

Response:`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are a helpful AI assistant. Respond naturally based on semantic understanding.' },
      { role: 'user', content: responsePrompt }
    ]);

    return response.content;
  }

  private handleError(error: any, context: AgentContext): AgentResponse {
    const errorMessage = error?.message || 'An unexpected error occurred';
    
    return {
      message: `I encountered an issue while processing your request: ${errorMessage}. Let me try a different approach.`,
      metadata: {
        orchestrated: true,
        error: errorMessage,
        fallback: true
      }
    };
  }

  // Method to continue multi-step execution
  async continueExecution(context: AgentContext, previousResult: any): Promise<AgentResponse> {
    const remainingActions = this.executionContext.get('remainingActions');
    const currentPlan = this.executionContext.get('currentPlan');

    if (!remainingActions || remainingActions.length === 0) {
      return {
        message: 'All steps completed successfully!',
        metadata: {
          orchestrated: true,
          completed: true
        }
      };
    }

    // Analyze previous result and adapt next action if needed
    const adaptationPrompt = `
Previous action result: ${JSON.stringify(previousResult)}
Next planned action: ${JSON.stringify(remainingActions[0])}

Should we proceed with the next action as planned, or adapt based on the result?
If adaptation is needed, provide the modified action.

Respond in JSON:
{
  "proceed": true/false,
  "reason": "explanation",
  "adaptedAction": null or modified action object
}`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'Analyze execution results and adapt plans.' },
        { role: 'user', content: adaptationPrompt }
      ]);

      const adaptation = JSON.parse(response.content);

      if (adaptation.proceed) {
        const nextAction = adaptation.adaptedAction || remainingActions[0];
        const newRemaining = remainingActions.slice(1);
        
        this.executionContext.set('remainingActions', newRemaining);

        return {
          toolCalls: [{
            tool: nextAction.tool,
            parameters: nextAction.parameters
          }],
          metadata: {
            orchestrated: true,
            multiStep: true,
            adapted: !!adaptation.adaptedAction,
            remainingSteps: newRemaining.length
          }
        };
      } else {
        return {
          message: `Execution stopped: ${adaptation.reason}`,
          metadata: {
            orchestrated: true,
            stopped: true,
            reason: adaptation.reason
          }
        };
      }
    } catch {
      // Fallback: continue with original plan
      return this.executeSingleAction(remainingActions[0], context);
    }
  }
}