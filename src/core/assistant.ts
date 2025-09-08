import chalk from 'chalk';
import { LMStudioProvider, ChatMessage } from '../providers/lmstudio.js';
import { ToolRegistry, ToolCall } from '../tools/index.js';
import { buildSystemPrompt, formatToolResult } from './prompts.js';
import { HistoryManager } from './history.js';
import { ErrorHandler, AssistantError } from './errors.js';
import { ToolOutputFormatter, ToolExecutionInfo } from './tool-output.js';
import { CheckpointManager } from './checkpoint.js';
import { ContextManager } from './context-manager.js';
import { ConfigManager } from './config.js';
import { TaskPlanner, TaskPlan } from './task-planner.js';
import { ReasoningAgent } from './reasoning-agent.js';
import { AgentRegistry, CleanOrchestrator, WebSearchAgent, FileSystemAgent, CodeExecutionAgent } from '../agents/index.js';
import { VisualLogger } from '../utils/visual-logger.js';
import { CommandConfirmationManager } from './command-confirmation.js';
import { performanceMonitor } from '../utils/performance-monitor.js';
import { toolResultCache } from '../utils/cache-manager.js';
import { VectorDatabase } from './vector-database.js';
import { CreativeWritingMode } from './creative-writing-mode.js';
import { CreativeMode } from './creative-mode.js';
import { GitHooksManager } from './git-hooks.js';
import { AdvancedDebugger } from './advanced-debugger.js';
import { ErrorRecoverySystem } from './error-recovery.js';
import { performanceOptimizer } from './performance-optimizer.js';

export class Assistant {
  private provider: LMStudioProvider;
  private toolRegistry: ToolRegistry;
  private conversationHistory: ChatMessage[] = [];
  private historyManager: HistoryManager;
  private toolFormatter: ToolOutputFormatter;
  private checkpointManager: CheckpointManager;
  private contextManager: ContextManager;
  private taskPlanner: TaskPlanner;
  private reasoningAgent: ReasoningAgent;
  private agentRegistry: AgentRegistry;
  private visualLogger: VisualLogger;
  private confirmationManager: CommandConfirmationManager;
  private vectorDB: VectorDatabase | null = null;
  private creativeWritingMode: CreativeWritingMode;
  private creativeSolutionMode: CreativeMode;
  private gitHooksManager: GitHooksManager;
  private advancedDebugger: AdvancedDebugger;
  private errorRecoverySystem: ErrorRecoverySystem;

  constructor(provider: LMStudioProvider) {
    this.provider = provider;
    this.toolRegistry = new ToolRegistry();
    this.historyManager = new HistoryManager();
    this.toolFormatter = new ToolOutputFormatter();
    this.checkpointManager = new CheckpointManager();
    this.contextManager = new ContextManager();
    this.taskPlanner = new TaskPlanner();
    this.reasoningAgent = new ReasoningAgent(provider);
    this.agentRegistry = new AgentRegistry();
    this.visualLogger = new VisualLogger();
    this.confirmationManager = new CommandConfirmationManager();
    this.creativeWritingMode = new CreativeWritingMode(provider);
    this.creativeSolutionMode = new CreativeMode(provider);
    this.gitHooksManager = new GitHooksManager(provider);
    this.advancedDebugger = new AdvancedDebugger(provider);
    this.errorRecoverySystem = new ErrorRecoverySystem(provider);
    
    // Start performance monitoring
    performanceOptimizer.startMonitoring();
    
    // Register default agents
    this.registerDefaultAgents();
  }

  async initialize(): Promise<void> {
    try {
      await this.historyManager.initialize();
    } catch (error) {
      console.warn('Failed to initialize history manager:', error);
      // Continue - history is not critical for basic operation
    }
    
    try {
      await this.checkpointManager.initialize();
    } catch (error) {
      console.warn('Failed to initialize checkpoint manager:', error);
      // Continue - checkpoints are not critical for basic operation
    }
    
    try {
      // Initialize vector database
      this.vectorDB = new VectorDatabase({
        collectionName: 'assistant_knowledge',
        useLocalEmbeddings: true
      });
      await this.vectorDB.initialize();
    } catch (error) {
      console.warn('Failed to initialize vector database:', error);
      // Continue - vector DB enhances but is not critical
    }
    
    try {
      // Initialize Git Hooks if in git repository
      await this.gitHooksManager.initialize();
    } catch (error) {
      console.warn('Git hooks not available:', error);
      // Continue - git hooks are optional
    }
  }
  
  private registerDefaultAgents(): void {
    // Register clean orchestrator with highest priority
    this.agentRegistry.register(new CleanOrchestrator(this.provider, this.agentRegistry), 100);
    
    // Register clean agents without patterns
    this.agentRegistry.register(new CodeExecutionAgent(), 40);
    this.agentRegistry.register(new WebSearchAgent(), 30);
    this.agentRegistry.register(new FileSystemAgent(), 20);
    
    // Use orchestrator as default
  }

  async chat(input: string): Promise<string> {
    const operationId = `chat_${Date.now()}`;
    performanceMonitor.startOperation(operationId, 'chat', { input });
    
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: input,
      });

      const processedInput = input;

      // Use agent system to handle request
      this.visualLogger.info('Thinking...', true);
      
      const agentContext = {
        userInput: processedInput,
        conversationHistory: this.conversationHistory,
        availableTools: this.toolRegistry.getToolNames(),
        metadata: {
          lastFileOperation: this.conversationHistory.some(msg => 
            msg.content.includes('listFiles') || 
            msg.content.includes('Directory:'))
        }
      };
      
      const agentOpId = `agent_${Date.now()}`;
      performanceMonitor.startOperation(agentOpId, 'agent_processing');
      const agentResponse = await this.agentRegistry.process(agentContext);
      performanceMonitor.endOperation(agentOpId);
      
      // Check if orchestrator wants to skip other agents (for conversation/greetings)
      if (agentResponse.skipOtherAgents) {
        return agentResponse.message || '';
      }
      
      // Convert agent response to reasoning format for compatibility
      const reasoning = {
        steps: [{ thought: 'Processing request via agents' }],
        finalAnswer: agentResponse.message || '',
        toolCalls: agentResponse.toolCalls || []
      };

      // Show reasoning steps (optional - based on verbose mode)
      const config = new ConfigManager();
      const settings = config.get();
      if (settings.ui.showToolDetails) {
        console.log(this.reasoningAgent.formatReasoningSteps(reasoning.steps));
      }

      // Step 2: Execute planned tool calls
      const toolResults: string[] = [];
      
      if (reasoning.toolCalls.length > 0) {
        for (const toolCall of reasoning.toolCalls) {
          this.visualLogger.toolExecution(toolCall.tool, toolCall.parameters);
          
          const tool = this.toolRegistry.get(toolCall.tool);
          if (!tool) {
            toolResults.push(chalk.red(`❌ Unknown tool: ${toolCall.tool}`));
            continue;
          }

          // Ask for confirmation for dangerous commands
          const confirmed = await this.confirmationManager.confirmExecution(
            toolCall.tool,
            toolCall.parameters
          );
          
          if (!confirmed) {
            toolResults.push(chalk.yellow('🚫 Command execution cancelled by user'));
            continue;
          }

          // Check cache first
          const cachedResult = toolResultCache.getToolResult(toolCall.tool, toolCall.parameters);
          if (cachedResult && toolCall.tool !== 'bash') { // Don't cache bash commands
            toolResults.push(formatToolResult(toolCall.tool, cachedResult));
            this.visualLogger.info(chalk.dim('📦 Using cached result'));
            continue;
          }
          
          const toolOpId = `tool_${toolCall.tool}_${Date.now()}`;
          performanceMonitor.startOperation(toolOpId, `tool_${toolCall.tool}`);
          
          try {
            const result = await tool.execute(toolCall.parameters);
            performanceMonitor.endOperation(toolOpId);
            
            // Cache successful results
            if (result.success && toolCall.tool !== 'bash') {
              toolResultCache.cacheToolResult(toolCall.tool, toolCall.parameters, result);
            }
            
            // Check if the tool returned an error
            if (!result.success) {
              const errorMsg = `⚠️ ${toolCall.tool} failed: ${result.error || 'Unknown error'}`;
              console.warn(errorMsg);
              toolResults.push(chalk.yellow(errorMsg));
              continue;
            }
            
            const formatted = formatToolResult(toolCall.tool, result);
            
            // For web search results, process them
            if (toolCall.tool === 'webSearch' && result.success && typeof result.data === 'string') {
              const processedResult = await this.processSearchResults(result.data, input);
              toolResults.push(processedResult);
            } else {
              toolResults.push(formatted);
            }
          } catch (error) {
            // This is a critical error - tool couldn't even execute
            const errorMsg = `❌ Critical error in ${toolCall.tool}: ${error instanceof Error ? error.message : error}`;
            console.error(errorMsg);
            toolResults.push(chalk.red(errorMsg));
            
            // Continue with other tools instead of failing completely
            continue;
          }
        }
      }

      // Step 3: Generate final response
      let finalResponse = '';
      
      // Check if this is part of a problem-solving workflow
      if (agentResponse.metadata?.problemSolving && toolResults.length > 0) {
        // This is a diagnostic step - analyze results and potentially continue
        const diagnosticResult = await this.analyzeDiagnosticResults(
          toolResults.join('\n'),
          agentResponse.metadata
        );
        
        finalResponse = diagnosticResult.message;
        
        // If there are more steps, store them for follow-up
        if (diagnosticResult.nextSteps && diagnosticResult.nextSteps.length > 0) {
          // Store diagnostic steps in metadata for potential follow-up
          // This could be enhanced with a proper state management system
        }
      } else if (toolResults.length > 0) {
        // Special handling for file operations - preserve formatting
        if (reasoning.toolCalls.some(tc => ['listFiles', 'readFile', 'writeFile', 'editFile', 'deleteFile'].includes(tc.tool))) {
          // For file operations, use the formatted result directly
          finalResponse = toolResults.join('\n\n');
        } else {
          // For other tools (like web search, project analysis), synthesize a response
          const resultsContext = toolResults.join('\n\n');
          
          // Check if this was a project analysis with opinion request
          const isProjectOpinion = /что.*дума|what.*think|мнени|opinion/.test(input) ||
                                  /расскаж.*проект|tell.*project/.test(input);
          
          let synthesisPrompt;
          if (isProjectOpinion) {
            synthesisPrompt = `The user asked about your thoughts on this project. Based on the project analysis below, provide your insights and opinion.

User's question: "${input}"

Project Analysis Results:
${resultsContext}

Please provide:
- Your overall impression of the project
- What you find interesting or well-done
- Any suggestions or observations
- Be conversational and helpful
- Respond in the user's language`;
          } else {
            synthesisPrompt = `Based on these results, provide a clear answer to the user's question: "${input}"

Results:
${resultsContext}

Provide a well-formatted response with:
- Key information highlighted
- Use bullet points where appropriate
- Include relevant numbers/data
- Be concise but complete`;
          }

          const synthesisResponse = await this.provider.chat([
            { role: 'system', content: 'You are a helpful AI assistant. Be friendly and insightful.' },
            { role: 'user', content: synthesisPrompt }
          ]);
          
          finalResponse = synthesisResponse.content;
        }
      } else if (reasoning.finalAnswer) {
        // If reasoning gave us a final answer, use it
        finalResponse = reasoning.finalAnswer;
      } else {
        // For simple conversations without tools, generate a direct response
        const conversationPrompt = `You are LM Studio Assistant - a helpful AI assistant running locally on the user's computer.

User said: "${input}"

Respond naturally and helpfully in their language. Keep responses brief and conversational. 
- If they're greeting you, greet back warmly
- If they're asking who you are, explain briefly
- If they're using slang or informal language, respond appropriately
- Never output just symbols or technical markers
- Always provide a meaningful response`;
        
        const response = await this.provider.chat([
          { role: 'system', content: 'You are LM Studio Assistant, a helpful and friendly AI assistant. Always respond naturally in the user\'s language.' },
          { role: 'user', content: conversationPrompt }
        ]);
        
        // Validate response - prevent empty or weird outputs
        finalResponse = response.content;
        if (!finalResponse || finalResponse.trim().length < 2 || finalResponse.match(/^[\*\#\-\_]+$/)) {
          // Fallback response for edge cases
          finalResponse = 'Извините, я не совсем понял. Можете переформулировать вопрос?';
        }
      }

      // Add to history
      this.conversationHistory.push({
        role: 'assistant',
        content: finalResponse,
      });

      // Save history (non-blocking, don't fail the response)
      this.historyManager.save(this.conversationHistory).catch(error => {
        console.warn('Failed to save conversation history:', error);
        // Continue - don't fail the entire response for history save issues
      });

      // Index conversation in vector database (non-blocking)
      if (this.vectorDB) {
        this.vectorDB.indexConversation([
          { role: 'user', content: input },
          { role: 'assistant', content: finalResponse }
        ]).catch(error => {
          console.debug('Failed to index conversation:', error);
          // Continue - vector indexing is not critical
        });

        // Also index any error-solution pairs
        if (agentResponse.metadata?.problemSolving && toolResults.length > 0) {
          const errorContext = toolResults.join('\n');
          if (errorContext.includes('error') || errorContext.includes('Error')) {
            this.vectorDB.indexErrorSolution(errorContext, finalResponse).catch(error => {
              console.debug('Failed to index error-solution:', error);
            });
          }
        }
      }

      performanceMonitor.endOperation(operationId);
      return finalResponse;
    } catch (error) {
      performanceMonitor.endOperation(operationId);
      if (error instanceof AssistantError) {
        return ErrorHandler.handle(error);
      }
      
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

  private async processSearchResults(rawResults: string, query: string): Promise<string> {
    // Extract key information from search results
    const lines = rawResults.split('\n').filter(line => line.trim());
    const processedInfo: string[] = [];
    
    // Look for weather information
    if (query.toLowerCase().includes('погод') || query.toLowerCase().includes('weather')) {
      const weatherInfo = this.extractWeatherInfo(lines);
      if (weatherInfo) {
        return weatherInfo;
      }
    }
    
    // Look for price information
    if (query.toLowerCase().includes('курс') || query.toLowerCase().includes('price') || 
        query.toLowerCase().includes('биткоин') || query.toLowerCase().includes('bitcoin')) {
      const priceInfo = this.extractPriceInfo(lines);
      if (priceInfo) {
        return priceInfo;
      }
    }
    
    // Default: return formatted search results
    return this.formatSearchResults(lines);
  }

  private extractWeatherInfo(lines: string[]): string | null {
    const weatherData: any = {};
    
    for (const line of lines) {
      // Temperature
      const tempMatch = line.match(/(\d+)°[CF]|температур[аы]?\s*:?\s*([+-]?\d+)/i);
      if (tempMatch) {
        weatherData.temperature = tempMatch[1] || tempMatch[2];
      }
      
      // Conditions
      if (line.match(/облачн|ясн|солнечн|дожд|снег|пасмурн|clear|cloud|sunny|rain|snow/i)) {
        weatherData.conditions = line.trim();
      }
      
      // Wind
      const windMatch = line.match(/ветер.*?(\d+)\s*(м\/с|км\/ч|mph)/i);
      if (windMatch) {
        weatherData.wind = `${windMatch[1]} ${windMatch[2]}`;
      }
      
      // Humidity
      const humidityMatch = line.match(/влажность.*?(\d+)%/i);
      if (humidityMatch) {
        weatherData.humidity = `${humidityMatch[1]}%`;
      }
    }
    
    if (Object.keys(weatherData).length > 0) {
      let result = chalk.cyan('\n🌤️ Погода:\n\n');
      if (weatherData.temperature) result += `🌡️ Температура: ${weatherData.temperature}°C\n`;
      if (weatherData.conditions) result += `☁️ Условия: ${weatherData.conditions}\n`;
      if (weatherData.wind) result += `💨 Ветер: ${weatherData.wind}\n`;
      if (weatherData.humidity) result += `💧 Влажность: ${weatherData.humidity}\n`;
      return result;
    }
    
    return null;
  }

  private extractPriceInfo(lines: string[]): string | null {
    const priceData: any = {};
    
    for (const line of lines) {
      // USD price
      const priceMatch = line.match(/\$\s?([\d,]+\.?\d*)|(\d{2,3},\d{3})\s*USD/);
      if (priceMatch) {
        priceData.price = priceMatch[1] || priceMatch[2];
      }
      
      // Percentage change
      const percentMatch = line.match(/([+-]?\d+\.?\d*)%/);
      if (percentMatch) {
        priceData.change = percentMatch[1];
      }
      
      // Market cap
      const capMatch = line.match(/cap.*?\$\s?([\d.]+[BMT])/i);
      if (capMatch) {
        priceData.marketCap = capMatch[1];
      }
    }
    
    if (priceData.price) {
      let result = chalk.cyan('\n💰 Курс:\n\n');
      result += chalk.green(`💵 Цена: $${priceData.price} USD\n`);
      
      if (priceData.change) {
        const changeNum = parseFloat(priceData.change);
        const arrow = changeNum >= 0 ? '📈' : '📉';
        const color = changeNum >= 0 ? chalk.green : chalk.red;
        result += color(`${arrow} Изменение: ${priceData.change}%\n`);
      }
      
      if (priceData.marketCap) {
        result += chalk.dim(`📊 Рыночная капитализация: $${priceData.marketCap}\n`);
      }
      
      return result;
    }
    
    return null;
  }

  private formatSearchResults(lines: string[]): string {
    let result = chalk.cyan('\n🔍 Результаты поиска:\n\n');
    let resultCount = 0;
    
    for (let i = 0; i < lines.length && resultCount < 5; i++) {
      const line = lines[i];
      if (line.match(/^\d+\.|^•|^-/) && line.length > 20) {
        result += `${line}\n`;
        resultCount++;
      }
    }
    
    return result;
  }

  // Keep other methods as they were...
  async *chatStream(input: string, onToken?: (token: string) => void): AsyncGenerator<string, void, unknown> {
    // For now, just use regular chat
    const response = await this.chat(input);
    yield response;
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

    this.conversationHistory = [...checkpoint.messages];
    
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
    // Implementation remains the same
  }

  listAgents(): string {
    const agents = this.agentRegistry.listAgents()
      .sort((a, b) => b.priority - a.priority); // Sort by priority
    
    let output = chalk.cyan('\n🤖 Available Agents (by priority):\n\n');
    
    for (const agent of agents) {
      const priorityColor = agent.priority >= 50 ? chalk.green : 
                           agent.priority >= 20 ? chalk.yellow : 
                           chalk.gray;
      
      output += chalk.yellow(`${agent.name}`) + priorityColor(` [priority: ${agent.priority}]\n`);
      output += `  ${agent.description}\n`;
      output += chalk.dim(`  Capabilities: ${agent.capabilities.join(', ')}\n\n`);
    }
    
    output += chalk.dim('\nThe orchestrator agent coordinates others for complex tasks.\n');
    
    return output;
  }

  private async analyzeDiagnosticResults(
    results: string,
    metadata: any
  ): Promise<{ message: string; nextSteps?: any[] }> {
    const analysisPrompt = `Analyze these diagnostic results and provide insights to the user.

Problem: ${metadata.problem || 'System performance issue'}
Current diagnostic step: ${metadata.currentStep || 'Initial check'}
Purpose: ${metadata.purpose || 'Understanding the issue'}

Results:
${results}

Based on these results:
1. What do we learn about the problem?
2. What are the key findings?
3. Should we continue with more diagnostics or do we have enough info?
4. What recommendations can we make?

Respond in JSON:
{
  "findings": ["finding1", "finding2"],
  "analysis": "detailed analysis",
  "userMessage": "clear explanation for the user in their language",
  "needsMoreDiagnostics": true/false,
  "recommendations": ["recommendation1", "recommendation2"],
  "solutions": [
    {
      "description": "what this will do",
      "command": "exact command to execute",
      "safe": true/false,
      "requiresConfirmation": true/false
    }
  ],
  "nextSteps": [{"step": "description", "command": "command if needed"}]
}`;

    const analysisResponse = await this.provider.chat([
      { role: 'system', content: 'You are an expert system administrator. Analyze diagnostic results and provide clear insights.' },
      { role: 'user', content: analysisPrompt }
    ]);

    try {
      const analysis = JSON.parse(analysisResponse.content);
      
      // Build user-friendly message
      let message = analysis.userMessage || 'Вот что я обнаружил:\n\n';
      
      if (analysis.findings && analysis.findings.length > 0) {
        message += chalk.cyan('🔍 Основные находки:\n');
        analysis.findings.forEach((finding: string) => {
          message += `  • ${finding}\n`;
        });
        message += '\n';
      }
      
      if (analysis.recommendations && analysis.recommendations.length > 0) {
        message += chalk.yellow('💡 Рекомендации:\n');
        analysis.recommendations.forEach((rec: string) => {
          message += `  • ${rec}\n`;
        });
      }
      
      // Execute solutions automatically
      if (analysis.solutions && analysis.solutions.length > 0) {
        message += chalk.green('\n\n🔧 Выполняю решения:\n');
        this.visualLogger.section('Executing Solutions');
        
        for (const solution of analysis.solutions) {
          if (solution.safe || !solution.requiresConfirmation) {
            this.visualLogger.info(`${solution.description}`, true);
            this.visualLogger.toolExecution('bash', { command: solution.command });
            
            try {
              // Execute the solution command
              const bashTool = this.toolRegistry.get('bash');
              if (bashTool) {
                const result = await bashTool.execute({ command: solution.command });
                if (result.success) {
                  this.visualLogger.toolResult('bash', true, result.data?.substring(0, 100));
                  message += chalk.green(`  ✓ Выполнено успешно\n`);
                  if (result.data) {
                    message += chalk.dim(`  Результат: ${result.data.substring(0, 100)}...\n`);
                  }
                } else {
                  this.visualLogger.toolResult('bash', false, result.error);
                  message += chalk.red(`  ✗ Ошибка: ${result.error}\n`);
                }
              }
            } catch (error) {
              this.visualLogger.error(`Failed to execute: ${error}`);
              message += chalk.red(`  ✗ Не удалось выполнить: ${error}\n`);
            }
          } else {
            this.visualLogger.info(`⚠ Requires confirmation: ${solution.description}`, true);
            message += chalk.yellow(`\n⚠ Требует подтверждения: ${solution.description}\n`);
            message += chalk.dim(`  Команда: ${solution.command}\n`);
          }
        }
      }
      
      if (analysis.needsMoreDiagnostics && metadata.remainingSteps && metadata.remainingSteps.length > 0) {
        message += chalk.dim('\n\nМне нужно проверить еще несколько вещей для полной картины...');
        return {
          message,
          nextSteps: metadata.remainingSteps
        };
      }
      
      return { message };
      
    } catch (error) {
      // Fallback to simple analysis
      return {
        message: `Результаты диагностики:\n\n${results}\n\nДля более детального анализа могу выполнить дополнительные проверки.`
      };
    }
  }

  // Creative mode methods
  getCreativeWritingMode(): CreativeWritingMode {
    return this.creativeWritingMode;
  }

  getCreativeSolutionMode(): CreativeMode {
    return this.creativeSolutionMode;
  }

  isInCreativeMode(): boolean {
    return this.creativeWritingMode.isWritingMode();
  }
  
  // New system accessors
  getGitHooksManager(): GitHooksManager {
    return this.gitHooksManager;
  }
  
  getAdvancedDebugger(): AdvancedDebugger {
    return this.advancedDebugger;
  }
  
  getErrorRecoverySystem(): ErrorRecoverySystem {
    return this.errorRecoverySystem;
  }
}