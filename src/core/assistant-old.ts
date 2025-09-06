import chalk from 'chalk';
import { LMStudioProvider, ChatMessage } from '../providers/lmstudio.js';
import { ToolRegistry, ToolCall } from '../tools/index.js';
import { buildSystemPrompt, formatToolResult } from './prompts.js';
import { HistoryManager } from './history.js';
import { ErrorHandler, AssistantError } from './errors.js';
import { ToolOutputFormatter, ToolExecutionInfo } from './tool-output.js';
import { CheckpointManager } from './checkpoint.js';
import { ContextManager } from './context-manager.js';
import { TaskPlanner, TaskPlan } from './task-planner.js';
import { IntentAnalyzer } from './intent-analyzer.js';
import { ResultFormatter } from './result-formatter.js';

export class Assistant {
  private provider: LMStudioProvider;
  private toolRegistry: ToolRegistry;
  private conversationHistory: ChatMessage[] = [];
  private historyManager: HistoryManager;
  private toolFormatter: ToolOutputFormatter;
  private checkpointManager: CheckpointManager;
  private contextManager: ContextManager;
  private taskPlanner: TaskPlanner;
  private intentAnalyzer: IntentAnalyzer;
  private resultFormatter: ResultFormatter;

  constructor(provider: LMStudioProvider) {
    this.provider = provider;
    this.toolRegistry = new ToolRegistry();
    this.historyManager = new HistoryManager();
    this.toolFormatter = new ToolOutputFormatter();
    this.checkpointManager = new CheckpointManager();
    this.contextManager = new ContextManager();
    this.taskPlanner = new TaskPlanner();
    this.intentAnalyzer = new IntentAnalyzer(provider);
    this.resultFormatter = new ResultFormatter();
  }

  async initialize(): Promise<void> {
    await this.historyManager.initialize();
    await this.checkpointManager.initialize();
  }

  async chat(input: string): Promise<string> {
    try {
      // Analyze intent first
      const intent = await this.intentAnalyzer.analyzeIntent(input);
      
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: input,
      });

      // Build messages array with system prompt
      const systemPrompt = buildSystemPrompt(this.toolRegistry.getToolDescriptions());
      const allMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory,
      ];

      // Optimize context if needed
      const contextWindow = await this.contextManager.optimizeContext(allMessages);
      const messages = contextWindow.messages;
      
      if (contextWindow.summary) {
        console.log(chalk.dim(`\n💡 ${contextWindow.summary}\n`));
      }

      // Get response from LM Studio
      const response = await this.provider.chat(messages);

      // Parse tool calls from response
      const toolCalls = this.parseToolCalls(response.content);

      // Execute tools if any
      let finalResponse = response.content;
      if (toolCalls.length > 0) {
        // Execute tools and collect execution info
        const executions: ToolExecutionInfo[] = [];
        const toolResults: string[] = [];
        
        for (const toolCall of toolCalls) {
          const startTime = Date.now();
          const result = await this.executeTool(toolCall);
          const duration = Date.now() - startTime;
          
          executions.push({ call: toolCall, result: result.raw || result, duration });
          
          // Format results based on intent
          let formattedResult = result.formatted || result;
          if (toolCall.tool === 'webSearch' && typeof formattedResult === 'string') {
            formattedResult = this.resultFormatter.formatSearchResults(formattedResult, intent);
          }
          
          toolResults.push(formattedResult);
        }
        
        // Show clean summary to user (technical details)
        const cleanSummary = this.toolFormatter.createCleanSummary(executions);
        // Don't show clean summary - it's redundant with the actual results

        // For the final response, just return the tool results
        const toolResultMessage = toolResults.join('\n\n');
        
        // Clean the original response from tool calls
        const cleanedResponse = this.cleanResponse(response.content);
        
        // Return only the tool results, not the JSON
        finalResponse = toolResultMessage || cleanedResponse;
        
        // Add to history
        this.conversationHistory.push({
          role: 'assistant',
          content: finalResponse,
        });
      } else {
        // No tools used, just add the response
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content,
        });
      }

      // Save history after each interaction
      await this.historyManager.save(this.conversationHistory);

      return finalResponse;
    } catch (error) {
      // Handle specific error types
      if (error instanceof AssistantError) {
        return ErrorHandler.handle(error);
      }
      
      // Wrap generic errors with context
      const wrappedError = new AssistantError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        {
          operation: 'Processing chat request',
          suggestion: 'Try rephrasing your request or check the logs',
        }
      );
      
      return ErrorHandler.handle(wrappedError);
    }
  }

  async *chatStream(input: string, onToken?: (token: string) => void): AsyncGenerator<string, void, unknown> {
    try {
      // Analyze intent first
      const intent = await this.intentAnalyzer.analyzeIntent(input);
      
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: input,
      });

      // Build messages array with system prompt
      const systemPrompt = buildSystemPrompt(this.toolRegistry.getToolDescriptions());
      const allMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory,
      ];

      // Optimize context if needed
      const contextWindow = await this.contextManager.optimizeContext(allMessages);
      const messages = contextWindow.messages;
      
      if (contextWindow.summary) {
        yield chalk.dim(`💡 ${contextWindow.summary}\n\n`);
      }

      // Stream response from LM Studio
      let fullResponse = '';
      for await (const token of this.provider.chatStream(messages, 0.7, 2000, onToken)) {
        fullResponse += token;
        yield token;
      }

      // After streaming completes, check for tool calls
      const toolCalls = this.parseToolCalls(fullResponse);
      
      if (toolCalls.length > 0) {
        // Execute tools quietly
        const executions: ToolExecutionInfo[] = [];
        const toolResults: string[] = [];
        
        for (const toolCall of toolCalls) {
          const startTime = Date.now();
          const result = await this.executeTool(toolCall);
          const duration = Date.now() - startTime;
          
          executions.push({ call: toolCall, result: result.raw || result, duration });
          
          // Format results based on intent
          let formattedResult = result.formatted || result;
          if (toolCall.tool === 'webSearch' && typeof formattedResult === 'string') {
            formattedResult = this.resultFormatter.formatSearchResults(formattedResult, intent);
          }
          
          toolResults.push(formattedResult);
        }
        
        // Don't show summary - just yield the results
        yield '\n';
        
        // Yield the formatted results directly
        for (const result of toolResults) {
          yield result + '\n';
        }
        
        // Add cleaned response to history
        const cleanedResponse = this.cleanResponse(fullResponse);
        fullResponse = cleanedResponse; // Update fullResponse for history
      } else {
        // No tools executed, add the full response
        this.conversationHistory.push({
          role: 'assistant',
          content: fullResponse,
        });
      }

      await this.historyManager.save(this.conversationHistory);
    } catch (error) {
      yield '\n' + ErrorHandler.handle(error);
    }
  }

  private parseToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Try to find tool calls in <tool_use> tags first (preferred method)
    const toolUseRegex = /<tool_use>([\s\S]*?)<\/tool_use>/g;
    let match;
    while ((match = toolUseRegex.exec(content)) !== null) {
      try {
        const toolData = JSON.parse(match[1].trim());
        if (toolData.tool && toolData.parameters) {
          toolCalls.push(toolData);
        }
      } catch (error) {
        console.error(chalk.yellow('Failed to parse tool call from tags:'), error);
      }
    }
    
    // If no tool calls found in tags, look for any JSON with tool structure
    if (toolCalls.length === 0) {
      // More flexible regex to find tool JSON
      const toolJsonRegex = /\{[^{}]*"tool"[^{}]*"[^"]+?"[^{}]*"parameters"[^{}]*\{[^{}]*\}[^{}]*\}/g;
      const matches = content.match(toolJsonRegex);
      
      if (matches) {
        for (const jsonMatch of matches) {
          try {
            const parsed = JSON.parse(jsonMatch);
            if (parsed.tool && parsed.parameters && this.isValidToolCall(parsed)) {
              toolCalls.push(parsed);
            }
          } catch (error) {
            // Try to fix common JSON issues
            let fixedJson = jsonMatch;
            // Add quotes around unquoted keys
            fixedJson = fixedJson.replace(/(\{|,)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
            // Try again with fixed JSON
            try {
              const parsed = JSON.parse(fixedJson);
              if (parsed.tool && parsed.parameters && this.isValidToolCall(parsed)) {
                toolCalls.push(parsed);
              }
            } catch (e) {
              // Still not valid, ignore
            }
          }
        }
      }
    }

    return toolCalls;
  }
  
  private isValidToolCall(obj: any): boolean {
    // Validate that it's a proper tool call structure
    return obj && 
           typeof obj.tool === 'string' && 
           obj.tool.length > 0 &&
           typeof obj.parameters === 'object' &&
           this.toolRegistry.get(obj.tool) !== undefined;
  }

  private async executeTool(toolCall: ToolCall): Promise<any> {
    const tool = this.toolRegistry.get(toolCall.tool);
    
    if (!tool) {
      return {
        formatted: chalk.red(`❌ Unknown tool: ${toolCall.tool}`),
        raw: { success: false, error: `Unknown tool: ${toolCall.tool}` }
      };
    }

    try {
      const result = await tool.execute(toolCall.parameters);
      return {
        formatted: formatToolResult(toolCall.tool, result),
        raw: result
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        formatted: chalk.red(`❌ Tool execution failed: ${errorMsg}`),
        raw: { success: false, error: errorMsg }
      };
    }
  }

  private cleanResponse(response: string): string {
    // Remove tool_use tags and their content
    let cleaned = response.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '');
    
    // Clean up any empty lines left after removing tool calls
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    return cleaned.trim();
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  async loadPreviousSession(): Promise<boolean> {
    const messages = await this.historyManager.loadLatest();
    if (messages.length > 0) {
      this.conversationHistory = messages;
      return true;
    }
    return false;
  }

  getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  async createCheckpoint(name: string, description?: string): Promise<string> {
    const checkpointId = await this.checkpointManager.createCheckpoint(
      this.conversationHistory,
      name,
      description,
      this.checkpointManager.getCurrentCheckpointId()
    );
    return checkpointId;
  }

  async loadCheckpoint(id: string): Promise<boolean> {
    const checkpoint = await this.checkpointManager.loadCheckpoint(id);
    if (checkpoint) {
      this.conversationHistory = [...checkpoint.messages];
      this.checkpointManager.setCurrentCheckpointId(id);
      return true;
    }
    return false;
  }

  async listCheckpoints(): Promise<string> {
    return await this.checkpointManager.getCheckpointTree();
  }

  async branchFromCheckpoint(checkpointId: string, branchName: string): Promise<string> {
    const checkpoint = await this.checkpointManager.loadCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }

    // Load the checkpoint messages
    this.conversationHistory = [...checkpoint.messages];
    
    // Create a new branch
    const branchId = await this.checkpointManager.createCheckpoint(
      this.conversationHistory,
      branchName,
      `Branch from: ${checkpoint.name}`,
      checkpointId
    );
    
    return branchId;
  }

  getTaskPlanner(): TaskPlanner {
    return this.taskPlanner;
  }

  async planAndExecuteTasks(taskDescription: string): Promise<void> {
    try {
      // Create a plan based on the description
      const plan = this.taskPlanner.createPlan('User Task Plan', taskDescription);
      
      // Use LLM to break down the task into steps
      const planningPrompt = `Break down this task into specific, actionable steps: "${taskDescription}"
      
Return a structured list of tasks in JSON format with the following structure:
{
  "tasks": [
    {
      "name": "task name",
      "description": "task description",
      "type": "sequential" or "parallel",
      "subtasks": [] // optional nested tasks
    }
  ]
}

Focus on concrete, executable steps.`;

      const response = await this.provider.chat([
        { role: 'system', content: 'You are a task planning assistant. Break down complex tasks into manageable steps.' },
        { role: 'user', content: planningPrompt }
      ]);

      // Parse the response and create tasks
      try {
        const parsed = JSON.parse(response.content);
        if (parsed.tasks) {
          for (const taskData of parsed.tasks) {
            const task = this.taskPlanner.addTask({
              name: taskData.name,
              description: taskData.description,
              type: taskData.type || 'sequential',
              subtasks: taskData.subtasks
            });

            // Register a handler for this task
            this.taskPlanner.registerTaskHandler(task.name, async (t) => {
              console.log(chalk.dim(`Executing: ${t.description || t.name}`));
              // Here you would implement actual task execution
              return { success: true };
            });
          }

          // Show the plan
          console.log(this.taskPlanner.visualizePlan());
          
          // Execute the plan
          await this.taskPlanner.executePlan();
        }
      } catch (error) {
        console.error(chalk.red('Failed to parse task plan from LLM response'));
      }
    } catch (error) {
      console.error(chalk.red('Task planning failed:', error));
    }
  }
}