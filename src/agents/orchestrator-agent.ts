import { BaseAgent, AgentContext, AgentResponse } from './base-agent.js';
import { LMStudioProvider } from '../providers/lmstudio.js';
import { AgentRegistry } from './agent-registry.js';
import { ConversationMemory } from './conversation-memory.js';
import { VisualLogger } from '../utils/visual-logger.js';
import { osDetector } from '../utils/os-detector.js';
import { SmartContextManager } from '../core/smart-context.js';
import { VisualTaskPlanner } from '../core/visual-task-planner.js';
import { EnhancedIntentUnderstanding } from '../core/enhanced-intent-understanding.js';
import { RichOutput } from '../core/rich-output.js';
import chalk from 'chalk';

export interface AgentTask {
  agentName: string;
  task: string;
  context: any;
}

export class OrchestratorAgent extends BaseAgent {
  name = 'orchestrator';
  description = 'Master agent that coordinates other agents and manages complex tasks';
  capabilities = ['task planning', 'agent coordination', 'multi-step execution', 'context management'];
  private memory: ConversationMemory;
  private executionHistory: Map<string, any> = new Map();
  private currentTaskId: string | null = null;
  private logger: VisualLogger;
  private contextManager: SmartContextManager;
  private taskPlanner: VisualTaskPlanner;
  private intentUnderstanding: EnhancedIntentUnderstanding;
  private richOutput: RichOutput;

  constructor(
    private provider: LMStudioProvider,
    private agentRegistry: AgentRegistry
  ) {
    super();
    this.memory = new ConversationMemory();
    this.logger = new VisualLogger();
    this.contextManager = new SmartContextManager('.lm-assistant');
    this.taskPlanner = new VisualTaskPlanner();
    this.intentUnderstanding = new EnhancedIntentUnderstanding();
    this.richOutput = new RichOutput();
  }

  async canHandle(context: AgentContext): Promise<boolean> {
    const input = context.userInput.toLowerCase();
    
    // Always handle system/process questions
    if (/процесс|process|систем|system/.test(input) && /сколько|how many|показ|show/.test(input)) {
      return true;
    }
    
    // Skip simple file operations that other agents can handle
    if (/^(delete|remove|удали)\s+\S+\.(txt|js|json|md|html|css)$/i.test(context.userInput)) {
      return false;
    }
    
    // Let AI understand and decide based on semantic meaning
    const decisionPrompt = `Analyze this request semantically to determine if orchestration is needed.

User said: "${context.userInput}"

Consider:
1. Is the user asking for information that exists somewhere (internet, system)?
2. Do they want to execute an action on the computer?
3. Is this a complex request needing multiple steps?
4. Does this require understanding context and choosing the right tool?

The orchestrator should handle requests that need:
- Tool selection based on understanding (not pattern matching)
- Execution of specific actions (bash, search, create)
- Context-aware decision making
- Bridging between what user wants and how to get it

Simple conversations and direct file operations can be handled by specialized agents.

Based on deep understanding of the request, respond with just "yes" or "no".`;

    try {
      const decision = await this.provider.chat([
        { role: 'system', content: 'You are a routing decision maker. Answer only with yes or no.' },
        { role: 'user', content: decisionPrompt }
      ]);
      
      return decision.content.toLowerCase().includes('yes');
    } catch {
      // Fallback: handle if it seems complex
      return context.userInput.split(' ').length > 3;
    }
  }
  
  private isFollowUpQuestion(input: string, context: AgentContext): boolean {
    // Short questions that likely reference previous context
    const words = input.split(' ').filter(w => w.length > 0);
    if (words.length > 5) return false; // Not a follow-up if too long
    
    // Check for reference words
    const referencePatterns = [
      /^(а|and|но|but)/i,
      /\b(это|эт[иоу]|that|this|there)\b/i,
      /\b(там|туда|here|где)\b/i,
      /\b(ещ[её]|еще|more|больше)\b/i
    ];
    
    const hasReference = referencePatterns.some(p => p.test(input));
    
    // Check for action continuation
    const continuationPatterns = [
      /^(да|yes|ок|okay|хорошо)/i,
      /\b(тоже|также|also|too)\b/i,
      /\b(посмотр|смотр|look|check)\b/i,
      /\b(покажи|показ|show)\b/i,
      /\b(найди|найт|поищ|search|find)\b/i
    ];
    
    const hasContinuation = continuationPatterns.some(p => p.test(input));
    
    // Check for questions about previous response
    const questionPatterns = [
      /^(что|what|как|how|где|where)/i,
      /\?$/
    ];
    
    const isQuestion = questionPatterns.some(p => p.test(input));
    
    return (hasReference || hasContinuation) && (words.length <= 4 || isQuestion);
  }
  
  private needsContextSwitch(input: string, currentContext: string): boolean {
    // Detect when user wants to switch from one context to another
    const contextIndicators = {
      'file_browser': /файл|папк|директор|file|folder/i,
      'project_analysis': /проект|код|анализ|project|code/i,
      'search': /найди|поиск|интернет|search|find|web/i,
      'general': /привет|hello|помоги|help/i
    };
    
    for (const [context, pattern] of Object.entries(contextIndicators)) {
      if (pattern.test(input) && context !== currentContext) {
        return true;
      }
    }
    
    return false;
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    this.logger.orchestratorStart(`task_${Date.now()}`, 'Analyzing request');
    
    // First use intent understanding
    const intent = await this.intentUnderstanding.understand(context.userInput);
    console.log(chalk.gray(`Intent: ${intent.type} (confidence: ${intent.confidence})`));
    
    // Update context manager
    this.contextManager.updateCurrentTask([context.userInput]);
    
    // Get OS information
    const osInfo = osDetector.getOSInfo();
    const osContext = `SYSTEM INFO: ${osInfo.name} (${osInfo.platform})${osInfo.version ? ' ' + osInfo.version : ''}`;
    
    // Get compressed context
    const compressedContext = this.contextManager.compress();
    
    // Let AI understand and plan what to do
    const understandingPrompt = `Analyze this request and determine the best approach.

User request: "${context.userInput}"
Intent detected: ${intent.type} (confidence: ${intent.confidence})
${intent.entities && Object.keys(intent.entities).length > 0 ? `Entities: ${JSON.stringify(intent.entities)}` : ''}

${compressedContext ? `Context Memory:\n${compressedContext}\n` : ''}
${context.conversationHistory.length > 0 ? `Recent context: ${context.conversationHistory.slice(-2).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

${osContext}

CONTEXT-AWARE UNDERSTANDING:
You must understand the user's intent based on:
1. What they're asking about (topic/subject)
2. What action they want (get info, create, execute, search)
3. What tool would best fulfill their request

DO NOT rely on keywords. Instead, understand the semantic meaning:
- If user asks about something happening on the internet/world -> webSearch
- If user asks about the computer/system state -> bash commands
- If user wants to create/modify files -> file tools
- If user just wants to chat -> conversation

The key is understanding WHAT the user wants to know or do, not matching patterns.

Determine:
1. Is this a greeting/introduction or identity question?
2. Is this asking for system information or status?
3. Does user want me to execute a command or just provide information?
4. If command needed, what's the exact command?

THINK DEEPLY about the user's intent:
1. What is the SUBJECT of their request? (weather, processes, files, general info)
2. What ACTION do they want? (check, create, search, execute)
3. WHERE should this information come from? (internet, local system, create new)
4. What is the BEST TOOL for this task?

Then determine the appropriate action and tool based on understanding, not keywords.

AVAILABLE TOOLS (use ONLY these):
- bash: Execute system commands (ls, pwd, ps, etc.)
- writeFile: Create new files with content
- webSearch: Search the internet for information
- analyzeProject: Analyze code projects
- fixSyntaxError: Fix JavaScript syntax errors

NEVER create tool names like "terminal", "file creation tool", etc. Use ONLY the tools listed above.

Respond in JSON:
{
  "understanding": "what the user wants",
  "approach": "single_action" or "multi_step" or "information" or "conversation",
  "actions": [
    {
      "description": "what to do",
      "tool": "bash" or "writeFile" or "webSearch" or "analyzeProject" or "fixSyntaxError",
      "command": "exact command if bash",
      "path": "file path if writeFile",
      "content": "file content if writeFile",
      "query": "search query if webSearch",
      "reason": "why this helps"
    }
  ],
  "response": "direct answer to user if conversation/information approach"
}`;

    try {
      const understanding = await this.provider.chat([
        { role: 'system', content: `You are an intelligent assistant that understands user intent through semantic analysis, not pattern matching.

CORE PRINCIPLE: Understand WHAT the user wants and WHY, then choose the appropriate tool.

SEMANTIC UNDERSTANDING FRAMEWORK:

1. ANALYZE THE REQUEST:
   - What is the user asking about? (files, weather, news, system info)
   - What action do they want? (show, create, check, execute)
   - Where is this information? (internet, local system, needs creation)

2. INFORMATION SOURCES:
   - Internet data: weather, news, prices, events -> webSearch
   - System data: files, folders, processes -> bash commands
   - New content: creating files -> writeFile

3. EXAMPLES OF SEMANTIC REASONING:
   - "Покажи файлы на диске в папке" -> wants to see files -> local system -> bash: ls
   - "Show current directory" -> wants current path -> local system -> bash: pwd
   - "Проверь погоду на Ямайке" -> wants weather info -> internet -> webSearch
   - "Сколько процессов запущено?" -> wants process count -> system info -> bash: ps aux | wc -l
   - "Show system information" -> wants system details -> local system -> bash: uname -a
   - "Create Express server in app.js" -> wants file with Express code -> writeFile with path:"app.js"
   - "Fix syntax error in buggy.js" -> wants to fix JS errors -> fixSyntaxError
   - "Analyze this project" -> wants project understanding -> analyzeProject

IMPORTANT: Understand the INTENT, not keywords. Ask yourself: "What does the user actually want to see or do?"

CRITICAL FOR BASH COMMANDS:
Generate commands that are appropriate for the current operating system (${osInfo.name}).
${osInfo.isMac ? `
For macOS:
- Sort processes by memory: ps aux | sort -nrk 4 | head
- Sort processes by CPU: ps aux | sort -nrk 3 | head
- List directory: ls -la
` : ''}
${osInfo.isLinux ? `
For Linux:
- Sort processes by memory: ps aux --sort=-%mem | head
- Sort processes by CPU: ps aux --sort=-%cpu | head  
- List directory: ls -la
` : ''}
${osInfo.isWindows ? `
For Windows:
- List processes: tasklist or Get-Process
- Sort by memory: Get-Process | Sort-Object -Property WS -Descending
- List directory: dir
` : ''}
Always use OS-appropriate commands!

ALWAYS respond with valid JSON. Do not wrap in markdown code blocks.` },
        { role: 'user', content: understandingPrompt }
      ]);

      // Clean markdown code blocks if present
      let cleanedContent = understanding.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const plan = JSON.parse(cleanedContent.trim());
      
      // Execute based on approach
      if (plan.approach === 'single_action' && plan.actions.length > 0) {
        const action = plan.actions[0];
        this.logger.info(action.description, true);
        
        if (action.tool === 'bash' && action.command) {
          return {
            toolCalls: [{
              tool: 'bash',
              parameters: { command: action.command }
            }],
            metadata: {
              orchestrated: true,
              understanding: plan.understanding,
              reason: action.reason
            }
          };
        } else if (action.tool === 'writeFile') {
          // For file creation, generate content if needed
          let content = action.content || '';
          let path = action.path || 'newfile.txt';
          
          // Extract filename from user input if not provided
          if (!action.path) {
            const match = context.userInput.match(/(?:in|file|файл)\s+(\S+\.\w+)/i);
            if (match) {
              path = match[1];
            }
          }
          
          // Generate appropriate content based on file type
          if (content === '' && path.endsWith('.js')) {
            if (context.userInput.toLowerCase().includes('express')) {
              content = this.generateExpressServer();
            } else {
              content = '// JavaScript file\n';
            }
          }
          
          return {
            toolCalls: [{
              tool: 'writeFile',
              parameters: {
                path: path,
                content: content
              }
            }],
            metadata: {
              orchestrated: true,
              understanding: plan.understanding
            }
          };
        } else if (action.tool === 'webSearch' && action.query) {
          return {
            toolCalls: [{
              tool: 'webSearch',
              parameters: { query: action.query }
            }],
            metadata: {
              orchestrated: true,
              understanding: plan.understanding
            }
          };
        } else if (action.tool === 'analyzeProject') {
          return {
            toolCalls: [{
              tool: 'analyzeProject',
              parameters: { path: action.path || '.' }
            }],
            metadata: {
              orchestrated: true,
              understanding: plan.understanding
            }
          };
        } else if (action.tool === 'fixSyntaxError') {
          // Extract filename from action or user input
          let path = action.path;
          if (!path) {
            const match = context.userInput.match(/(\S+\.js)/i);
            if (match) {
              path = match[1];
            }
          }
          
          return {
            toolCalls: [{
              tool: 'fixSyntaxError',
              parameters: { path: path || 'file.js' }
            }],
            metadata: {
              orchestrated: true,
              understanding: plan.understanding
            }
          };
        } else if (action.tool) {
          return {
            toolCalls: [{
              tool: action.tool,
              parameters: action.parameters || {}
            }],
            metadata: {
              orchestrated: true,
              understanding: plan.understanding
            }
          };
        }
      } else if (plan.approach === 'multi_step') {
        return this.executeMultiStepPlan(context, plan);
      } else if (plan.approach === 'conversation' || plan.approach === 'information') {
        // For conversation/information, return message immediately without tools
        return {
          message: plan.response || this.getConversationalResponse(context.userInput),
          skipOtherAgents: true, // Prevent other agents from processing
          metadata: {
            orchestrated: true,
            approach: plan.approach
          }
        };
      }
      
      // Default: provide response
      return {
        message: plan.response || plan.understanding,
        metadata: {
          orchestrated: true,
          approach: plan.approach
        }
      };
      
    } catch (error) {
      this.logger.error('Failed to understand request, using fallback');
      // Fallback to simpler processing
      return this.simpleFallback(context);
    }
    
    // Analyze what the user wants based on context
    const analysisPrompt = `Analyze this conversation and determine what actions are needed:

Previous context:
${context.conversationHistory.slice(-4).map(msg => `${msg.role}: ${msg.content.substring(0, 200)}`).join('\n')}

Current request: "${context.userInput}"

Determine:
1. What is the user asking for?
2. What context from previous messages is relevant?
3. What specific actions/tools are needed?
4. Is this a multi-step task that requires planning?

Respond in JSON format:
{
  "intent": "brief description",
  "context": "relevant previous info",
  "actions": ["action1", "action2"],
  "suggestedTools": ["tool1", "tool2"],
  "requiresPlanning": true/false
}`;

    const analysis = await this.provider.chat([
      { role: 'system', content: 'You are an AI task analyzer. Analyze requests and suggest actions.' },
      { role: 'user', content: analysisPrompt }
    ]);

    try {
      const parsedAnalysis = JSON.parse(analysis.content);
      
      // Check if this requires multi-agent coordination
      if (parsedAnalysis.requiresPlanning || 
          (parsedAnalysis.actions && parsedAnalysis.actions.length > 2)) {
        return this.planAndExecuteMultiStep(context, parsedAnalysis);
      }
      
      // Based on analysis, create tool calls
      const toolCalls = [];
      
      // Map suggested actions to tool calls
      if (parsedAnalysis.suggestedTools && parsedAnalysis.suggestedTools.length > 0) {
        for (const tool of parsedAnalysis.suggestedTools) {
          switch (tool) {
            case 'webSearch':
              // Extract what to search from context
              let searchQuery = context.userInput;
              if (/это|that|there/.test(context.userInput)) {
                const previousMessages = [...context.conversationHistory].reverse();
                for (const msg of previousMessages) {
                  if (msg.role === 'user' && msg.content !== context.userInput) {
                    searchQuery = msg.content;
                    break;
                  }
                }
              }
              toolCalls.push({
                tool: 'webSearch',
                parameters: { query: searchQuery }
              });
              break;
              
            case 'analyzeProject':
              toolCalls.push({
                tool: 'analyzeProject',
                parameters: { path: '.' }
              });
              break;
              
            case 'listFiles':
              toolCalls.push({
                tool: 'listFiles',
                parameters: { path: '.' }
              });
              break;
              
            case 'bash':
              // For bash, we need to determine the command from context
              if (parsedAnalysis.context && parsedAnalysis.context.includes('command:')) {
                const cmdMatch = parsedAnalysis.context.match(/command:\s*(.+)/);
                if (cmdMatch) {
                  toolCalls.push({
                    tool: 'bash',
                    parameters: { command: cmdMatch[1].trim() }
                  });
                }
              }
              break;
          }
        }
      }
      
      if (toolCalls.length > 0) {
        return { 
          toolCalls,
          metadata: {
            orchestrated: true,
            analysis: parsedAnalysis
          }
        };
      }
      
    } catch (error) {
      // If JSON parsing fails, try simple pattern matching
      const input = context.userInput.toLowerCase();
      if (/посмотр.*интернет|search.*online|найди/.test(input)) {
        // Extract search topic from conversation
        const previousMessages = [...context.conversationHistory].reverse();
        for (const msg of previousMessages) {
          if (msg.role === 'user' && msg.content !== context.userInput) {
            return {
              toolCalls: [{
                tool: 'webSearch',
                parameters: { query: msg.content }
              }]
            };
          }
        }
      }
    }
    
    // Default: delegate to appropriate agent
    return {
      message: 'Let me help you with that.',
      nextAgent: 'conversational'
    };
  }
  
  private buildEnrichedRequest(
    context: AgentContext, 
    lastTopic?: string, 
    relatedContent?: string | null
  ): string {
    let enriched = context.userInput;
    
    // If it's a vague request, add context
    if (context.userInput.split(' ').length < 5) {
      if (lastTopic) {
        enriched = `${context.userInput} (в контексте: ${lastTopic})`;
      }
      if (relatedContent) {
        enriched = `${enriched} (связано с: ${relatedContent})`;
      }
    }
    
    return enriched;
  }
  
  private async handleFollowUp(
    context: AgentContext,
    enrichedRequest: string
  ): Promise<AgentResponse> {
    const input = context.userInput.toLowerCase();
    
    // Common follow-up patterns and their handling
    if (/посмотр.*интернет|look.*online|поищи.*сет|search.*web/i.test(input)) {
      // Find what to search from previous context
      const searchQuery = this.extractSearchQuery(context);
      if (searchQuery) {
        return {
          toolCalls: [{
            tool: 'webSearch',
            parameters: { query: searchQuery }
          }]
        };
      }
    }
    
    // "Show more", "tell more" type requests
    if (/ещ[её]|еще|больше|подробн|more|detail/i.test(input)) {
      const lastTopic = this.memory.getLastTopic();
      if (lastTopic === 'project') {
        return {
          toolCalls: [{
            tool: 'analyzeProject',
            parameters: { path: '.', detailed: true }
          }]
        };
      }
    }
    
    // Yes/No confirmations
    if (/^(да|yes|конечно|sure|ок|хорошо)/i.test(input)) {
      // Execute the last suggested action
      return this.executeLastSuggestion(context);
    }
    
    // Default: try to understand with AI
    return this.analyzeWithAI(context, enrichedRequest);
  }
  
  private extractSearchQuery(context: AgentContext): string | null {
    // Look for the last substantive user message
    for (let i = context.conversationHistory.length - 2; i >= 0; i--) {
      const msg = context.conversationHistory[i];
      if (msg.role === 'user' && msg.content.length > 10) {
        // Extract the main topic
        const content = msg.content;
        if (/погода|weather/i.test(content)) {
          const locationMatch = content.match(/в\s+(\S+)|in\s+(\S+)/i);
          return locationMatch ? 
            `погода в ${locationMatch[1] || locationMatch[2]}` : 
            content;
        }
        return content;
      }
    }
    return null;
  }
  
  private executeLastSuggestion(context: AgentContext): AgentResponse {
    // Look for the last assistant message with a suggestion
    for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
      const msg = context.conversationHistory[i];
      if (msg.role === 'assistant') {
        if (/могу.*найти|can.*search|поискать/i.test(msg.content)) {
          const searchQuery = this.extractSearchQuery(context);
          if (searchQuery) {
            return {
              toolCalls: [{
                tool: 'webSearch',
                parameters: { query: searchQuery }
              }]
            };
          }
        }
      }
    }
    
    return {
      message: 'Что именно вы хотите, чтобы я сделал?',
      nextAgent: 'conversational'
    };
  }
  
  private async analyzeWithAI(
    context: AgentContext,
    enrichedRequest: string
  ): Promise<AgentResponse> {
    // Use AI to understand complex requests
    const prompt = `Based on this conversation, what should I do?

Context: ${enrichedRequest}
User said: "${context.userInput}"

Previous messages:
${context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 100)}...`).join('\n')}

What action should be taken? Respond with the tool to use and parameters.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are a helpful assistant. Determine the right action.' },
      { role: 'user', content: prompt }
    ]);
    
    // Try to extract tool suggestion from response
    if (/search|найти|поиск/i.test(response.content)) {
      const query = this.extractSearchQuery(context) || context.userInput;
      return {
        toolCalls: [{
          tool: 'webSearch',
          parameters: { query }
        }]
      };
    }
    
    return {
      message: response.content,
      nextAgent: 'conversational'
    };
  }
  
  async planAndDelegate(task: string): Promise<AgentTask[]> {
    // Break down complex task into subtasks
    const planningPrompt = `Break down this task into specific steps that can be handled by specialized agents:

Task: "${task}"

Available agents:
- file-operations: handles file system operations
- web-search: searches the internet
- code-execution: runs code and analyzes projects
- conversational: general chat and questions

Create a step-by-step plan. Respond in JSON:
{
  "steps": [
    {"agent": "agent-name", "task": "specific task description"},
    ...
  ]
}`;

    const plan = await this.provider.chat([
      { role: 'system', content: 'You are a task planning AI. Break down tasks into actionable steps.' },
      { role: 'user', content: planningPrompt }
    ]);
    
    try {
      const parsed = JSON.parse(plan.content);
      return parsed.steps;
    } catch {
      return [];
    }
  }

  private async handleVagueRequest(context: AgentContext): Promise<AgentResponse> {
    // Use AI to intelligently decide what to do
    const decisionPrompt = `The user made a vague request. Analyze the context and decide what would be most helpful.

User said: "${context.userInput}"

Recent conversation:
${context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

Current capabilities:
1. Search the internet for information
2. Execute commands on the computer
3. Analyze projects and code
4. Browse and manage files
5. Have a conversation about theoretical topics

Based on the context, what would be the most helpful action? Consider:
- If there's been recent discussion about a topic, maybe search for more info
- If user seems bored, maybe suggest something interesting to explore
- If it's a general request, maybe show what the system can do
- If context suggests a specific need, address that

Respond in JSON:
{
  "decision": "what to do",
  "reasoning": "why this is helpful",
  "action": "specific action",
  "toolCall": {
    "tool": "toolName",
    "parameters": {}
  }
}

Be creative and helpful! Don't just list capabilities unless that's truly the best option.`;

    const decision = await this.provider.chat([
      { role: 'system', content: 'You are a helpful AI assistant. Make intelligent decisions about what would be most useful for the user.' },
      { role: 'user', content: decisionPrompt }
    ]);

    try {
      const parsed = JSON.parse(decision.content);
      
      // Execute the decided action
      if (parsed.toolCall && parsed.toolCall.tool) {
        return {
          toolCalls: [parsed.toolCall],
          metadata: {
            orchestrated: true,
            decision: parsed.decision,
            reasoning: parsed.reasoning
          }
        };
      }
      
      // If no specific tool, provide a helpful response
      return {
        message: parsed.action || parsed.decision,
        metadata: {
          orchestrated: true,
          reasoning: parsed.reasoning
        }
      };
    } catch (error) {
      // Fallback: suggest some interesting options
      const suggestions = [
        'Могу найти интересную информацию в интернете на любую тему',
        'Могу проанализировать ваш проект и дать советы',
        'Могу показать файлы и помочь с организацией',
        'Могу выполнить команды на компьютере',
        'Могу просто поговорить на любые темы'
      ];
      
      const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
      
      return {
        message: `${randomSuggestion}. Что вас интересует?`,
        metadata: {
          orchestrated: true,
          suggestedCapabilities: suggestions
        }
      };
    }
  }

  private isProblemStatement(input: string): boolean {
    const problemPatterns = [
      /медленн|slow|тормоз|лаг|lag|зависа/i,
      /не\s+работа|not\s+work|сломал|broken|ошибк|error/i,
      /проблем|problem|issue|беда|trouble/i,
      /помоги\s+с|help\s+with|нужна\s+помощь/i,
      /почему.*не|why.*not|как\s+исправить|how\s+to\s+fix/i,
      /что\s+делать\s+если|what\s+to\s+do\s+if/i
    ];
    
    return problemPatterns.some(p => p.test(input));
  }

  private async handleProblemSolving(context: AgentContext): Promise<AgentResponse> {
    this.logger.section('Problem Diagnosis & Solution');
    this.logger.info(`Analyzing: ${context.userInput}`, true);
    
    // Use AI to understand the problem and create a diagnostic plan
    const diagnosticPrompt = `The user has described a problem. Analyze it and create a step-by-step diagnostic and solution plan.

User said: "${context.userInput}"

Create a detailed plan to:
1. Understand the problem
2. Gather necessary information
3. Diagnose the issue
4. Provide solutions

For example, if the computer is slow, we need to:
- Check RAM usage (command: free -h or top)
- Check disk space (command: df -h)
- Check running processes (command: ps aux --sort=-%cpu | head)
- Check system load (command: uptime)

Then based on findings, execute solutions:
- Kill high CPU processes
- Clear cache
- Free up disk space
- etc.

Respond in JSON:
{
  "problem": "brief problem description",
  "diagnosticSteps": [
    {
      "step": "description of what to check",
      "tool": "bash",
      "command": "specific command to run",
      "purpose": "why we're checking this"
    }
  ],
  "potentialCauses": ["cause1", "cause2"],
  "potentialSolutions": [
    {
      "cause": "what problem this solves",
      "command": "command to fix it",
      "safe": true/false,
      "description": "what this does"
    }
  ],
  "immediateAction": {
    "tool": "toolName",
    "parameters": {}
  }
}`;

    const plan = await this.provider.chat([
      { role: 'system', content: 'You are an expert system administrator and problem solver. Create detailed diagnostic plans.' },
      { role: 'user', content: diagnosticPrompt }
    ]);

    try {
      const diagnosticPlan = JSON.parse(plan.content);
      
      // Execute the first diagnostic step immediately
      if (diagnosticPlan.immediateAction) {
        return {
          toolCalls: [diagnosticPlan.immediateAction],
          metadata: {
            orchestrated: true,
            problemSolving: true,
            problem: diagnosticPlan.problem,
            nextSteps: diagnosticPlan.diagnosticSteps,
            analysis: diagnosticPlan
          }
        };
      }
      
      // If we have diagnostic steps, execute the first one
      if (diagnosticPlan.diagnosticSteps && diagnosticPlan.diagnosticSteps.length > 0) {
        const firstStep = diagnosticPlan.diagnosticSteps[0];
        return {
          toolCalls: [{
            tool: firstStep.tool || 'bash',
            parameters: firstStep.command ? { command: firstStep.command } : {}
          }],
          metadata: {
            orchestrated: true,
            problemSolving: true,
            currentStep: firstStep.step,
            purpose: firstStep.purpose,
            remainingSteps: diagnosticPlan.diagnosticSteps.slice(1),
            fullPlan: diagnosticPlan
          }
        };
      }
      
      // Fallback: provide analysis
      return {
        message: `I understand you're experiencing: ${diagnosticPlan.problem}. Let me help diagnose this.`,
        metadata: {
          orchestrated: true,
          analysis: diagnosticPlan
        }
      };
      
    } catch (error) {
      // If parsing fails, try a simpler approach
      return this.handleProblemWithSimpleApproach(context);
    }
  }

  private async handleProblemWithSimpleApproach(context: AgentContext): Promise<AgentResponse> {
    const input = context.userInput.toLowerCase();
    
    // Common problem patterns and their diagnostic commands
    if (/медленн|slow|тормоз/.test(input)) {
      return {
        toolCalls: [{
          tool: 'bash',
          parameters: { command: 'top -bn1 | head -20' }
        }],
        metadata: {
          orchestrated: true,
          diagnostic: 'Checking system performance'
        }
      };
    }
    
    if (/памят|memory|ram/.test(input)) {
      return {
        toolCalls: [{
          tool: 'bash',
          parameters: { command: 'free -h' }
        }],
        metadata: {
          orchestrated: true,
          diagnostic: 'Checking memory usage'
        }
      };
    }
    
    if (/диск|disk|space|место/.test(input)) {
      return {
        toolCalls: [{
          tool: 'bash',
          parameters: { command: 'df -h' }
        }],
        metadata: {
          orchestrated: true,
          diagnostic: 'Checking disk space'
        }
      };
    }
    
    // Default: ask for more details
    return {
      message: 'Я вижу у вас есть проблема. Расскажите подробнее, что именно происходит?',
      metadata: {
        orchestrated: true,
        needsMoreInfo: true
      }
    };
  }

  private async planAndExecuteMultiStep(
    context: AgentContext,
    analysis: any
  ): Promise<AgentResponse> {
    // Generate unique task ID for tracking
    this.currentTaskId = `task_${Date.now()}`;
    
    this.logger.orchestratorStart(this.currentTaskId, 'Planning multi-step task');
    
    // Create execution plan
    const planPrompt = `Create a detailed execution plan for this task.

User request: "${context.userInput}"
Analysis: ${JSON.stringify(analysis, null, 2)}

Available agents:
${this.agentRegistry.listAgents().map(a => `- ${a.name}: ${a.description}`).join('\n')}

Create a step-by-step plan with specific agent assignments.

Respond in JSON:
{
  "taskSummary": "brief description",
  "steps": [
    {
      "step": 1,
      "agent": "agent-name",
      "action": "what to do",
      "expectedInput": "what this agent needs",
      "expectedOutput": "what we expect back",
      "dependsOn": [0]
    }
  ],
  "successCriteria": "how we know it worked"
}`;

    const planResponse = await this.provider.chat([
      { role: 'system', content: 'You are a master task planner. Create detailed execution plans.' },
      { role: 'user', content: planPrompt }
    ]);

    try {
      const executionPlan = JSON.parse(planResponse.content);
      
      // Store plan in history
      this.executionHistory.set(this.currentTaskId, {
        plan: executionPlan,
        startTime: Date.now(),
        results: []
      });
      
      // Execute first step
      return this.executeNextStep(context, executionPlan, 0);
      
    } catch (error) {
      return {
        message: 'Failed to create execution plan. Let me try a simpler approach.',
        nextAgent: 'conversational'
      };
    }
  }

  private async executeNextStep(
    context: AgentContext,
    plan: any,
    stepIndex: number
  ): Promise<AgentResponse> {
    if (stepIndex >= plan.steps.length) {
      // All steps completed
      return this.summarizeExecution(context, plan);
    }
    
    const currentStep = plan.steps[stepIndex];
    const taskData = this.executionHistory.get(this.currentTaskId!);
    
    this.logger.orchestratorStep(stepIndex + 1, plan.steps.length, currentStep.action);
    
    // Prepare context for the agent with full visibility
    const agentContext: AgentContext = {
      ...context,
      userInput: currentStep.action,
      metadata: {
        ...context.metadata,
        orchestratorTask: this.currentTaskId,
        currentStep: stepIndex + 1,
        totalSteps: plan.steps.length,
        stepDescription: currentStep.action,
        expectedOutput: currentStep.expectedOutput,
        previousResults: this.getPreviousResults(stepIndex),
        fullContext: {
          originalRequest: context.userInput,
          conversationHistory: context.conversationHistory,
          executionPlan: plan
        }
      }
    };
    
    // Delegate to specific agent
    const agent = this.agentRegistry.getAgent(currentStep.agent);
    if (!agent) {
      console.log(chalk.red(`❌ Agent not found: ${currentStep.agent}`));
      return this.handleStepFailure(context, plan, stepIndex, 'Agent not found');
    }
    
    // Execute with real-time monitoring
    this.logger.agentStart(currentStep.agent, currentStep.action);
    
    const result = await this.agentRegistry.processWithAgent(
      currentStep.agent,
      agentContext
    );
    
    // Store result
    taskData.results.push({
      step: stepIndex,
      agent: currentStep.agent,
      action: currentStep.action,
      result: result,
      timestamp: Date.now()
    });
    
    // Analyze result and decide next action
    return this.analyzeStepResult(context, plan, stepIndex, result);
  }

  private async analyzeStepResult(
    context: AgentContext,
    plan: any,
    stepIndex: number,
    result: AgentResponse
  ): Promise<AgentResponse> {
    const currentStep = plan.steps[stepIndex];
    
    this.logger.agentEnd(currentStep.agent, true);
    this.logger.stepProgress(stepIndex + 1, plan.steps.length, `Completed: ${currentStep.action}`);
    
    // Check if result meets expectations
    const validationPrompt = `Analyze this step result and determine if it was successful.

Step: ${currentStep.action}
Expected output: ${currentStep.expectedOutput}
Actual result: ${JSON.stringify(result, null, 2)}

Is this successful? Should we continue to the next step?

Respond in JSON:
{
  "success": true/false,
  "reason": "explanation",
  "shouldContinue": true/false,
  "adjustments": "any needed adjustments"
}`;

    const validation = await this.provider.chat([
      { role: 'system', content: 'You are analyzing task execution results.' },
      { role: 'user', content: validationPrompt }
    ]);

    try {
      const validationResult = JSON.parse(validation.content);
      
      if (validationResult.success && validationResult.shouldContinue) {
        // Continue to next step
        return this.executeNextStep(context, plan, stepIndex + 1);
      } else if (!validationResult.success) {
        // Handle failure
        return this.handleStepFailure(context, plan, stepIndex, validationResult.reason);
      } else {
        // Success but don't continue
        return this.summarizeExecution(context, plan);
      }
    } catch {
      // Default: continue to next step
      return this.executeNextStep(context, plan, stepIndex + 1);
    }
  }

  private getPreviousResults(currentStep: number): any[] {
    const taskData = this.executionHistory.get(this.currentTaskId!);
    if (!taskData) return [];
    
    return taskData.results
      .filter((r: any) => r.step < currentStep)
      .map((r: any) => ({
        step: r.step,
        agent: r.agent,
        action: r.action,
        output: r.result.message || r.result.toolCalls
      }));
  }

  private async handleStepFailure(
    context: AgentContext,
    plan: any,
    stepIndex: number,
    reason: string
  ): Promise<AgentResponse> {
    this.logger.error(`Step ${stepIndex + 1} failed: ${reason}`);
    
    // Try to recover or provide helpful message
    return {
      message: `I encountered an issue at step ${stepIndex + 1}: ${reason}. Let me try a different approach.`,
      metadata: {
        orchestrated: true,
        taskId: this.currentTaskId,
        failedAtStep: stepIndex,
        reason: reason
      }
    };
  }

  private async summarizeExecution(
    context: AgentContext,
    plan: any
  ): Promise<AgentResponse> {
    const taskData = this.executionHistory.get(this.currentTaskId!);
    
    this.logger.success(`All steps completed for task ${this.currentTaskId}`);
    this.logger.section('Task Summary');
    
    // Create summary of what was accomplished
    const summaryPrompt = `Summarize the task execution for the user.

Original request: "${context.userInput}"
Task plan: ${plan.taskSummary}

Steps executed:
${taskData.results.map((r: any) => 
  `${r.step + 1}. ${r.action} (${r.agent}) - ${r.result.message || 'completed'}`
).join('\n')}

Create a clear, helpful summary of what was accomplished.`;

    const summary = await this.provider.chat([
      { role: 'system', content: 'You are summarizing completed tasks for users.' },
      { role: 'user', content: summaryPrompt }
    ]);
    
    // Clear current task
    this.currentTaskId = null;
    
    return {
      message: summary.content,
      metadata: {
        orchestrated: true,
        taskCompleted: true,
        executionSummary: taskData
      }
    };
  }

  private async executeMultiStepPlan(context: AgentContext, plan: any): Promise<AgentResponse> {
    this.logger.section('Multi-Step Execution');
    
    // For now, execute first action
    if (plan.actions && plan.actions.length > 0) {
      const firstAction = plan.actions[0];
      this.logger.orchestratorStep(1, plan.actions.length, firstAction.description);
      
      // Special handling for file creation
      let parameters = firstAction.parameters || {};
      if (firstAction.tool === 'writeFile') {
        // If creating Express server, ensure we have content
        if (context.userInput.toLowerCase().includes('express server') && !parameters.content) {
          parameters = {
            path: parameters.path || 'server.js',
            content: this.generateExpressServer()
          };
        }
        // Ensure we have a path
        if (!parameters.path) {
          parameters.path = 'newfile.txt';
        }
      } else if (firstAction.command) {
        parameters = { command: firstAction.command };
      }
      
      // Validate tool exists
      const validTools = ['bash', 'writeFile', 'webSearch', 'analyzeProject', 'fixSyntaxError'];
      if (!validTools.includes(firstAction.tool)) {
        // Try to map unknown tools to valid ones
        if (firstAction.tool === 'terminal' || firstAction.tool === 'bash commands') {
          firstAction.tool = 'bash';
        } else if (firstAction.tool === 'file creation tool') {
          firstAction.tool = 'writeFile';
        } else {
          // Skip invalid tool
          return {
            message: `I need to ${firstAction.description} but I'll use a different approach.`,
            metadata: { orchestrated: true, invalidTool: firstAction.tool }
          };
        }
      }
      
      return {
        toolCalls: [{
          tool: firstAction.tool,
          parameters: parameters
        }],
        metadata: {
          orchestrated: true,
          multiStep: true,
          totalSteps: plan.actions.length,
          remainingActions: plan.actions.slice(1)
        }
      };
    }
    
    return {
      message: 'I understand your request but need more details to proceed.',
      metadata: { orchestrated: true }
    };
  }

  private async simpleFallback(context: AgentContext): Promise<AgentResponse> {
    // Let AI understand the request without hardcoded patterns
    const input = context.userInput.toLowerCase();
    
    // Get OS information for context
    const osInfo = osDetector.getOSInfo();
    
    // Handle Express server creation
    if (/create.*express.*server|создай.*express.*сервер/.test(input)) {
      const filenameMatch = input.match(/in\s+(\S+\.js)/);
      const filename = filenameMatch ? filenameMatch[1] : 'server.js';
      return {
        toolCalls: [{
          tool: 'writeFile',
          parameters: {
            path: filename,
            content: this.generateExpressServer()
          }
        }],
        metadata: { orchestrated: true, fallback: true }
      };
    }
    
    // Handle basic file creation with content
    if (/create\s+(?:a\s+)?file\s+(\S+)\s+with\s+content/i.test(input)) {
      const match = context.userInput.match(/create\s+(?:a\s+)?file\s+(\S+)\s+with\s+content\s+['"](.*)['"]/i);
      if (match) {
        return {
          toolCalls: [{
            tool: 'writeFile',
            parameters: {
              path: match[1],
              content: match[2]
            }
          }],
          metadata: { orchestrated: true, fallback: true }
        };
      }
    }
    
    // Handle file creation with code
    if (/create\s+(?:a\s+)?file\s+(\S+)\s+with\s+(?:this\s+)?code:/i.test(input)) {
      const match = context.userInput.match(/create\s+(?:a\s+)?file\s+(\S+)\s+with\s+(?:this\s+)?code:\s*(.+)$/i);
      if (match) {
        return {
          toolCalls: [{
            tool: 'writeFile',
            parameters: {
              path: match[1],
              content: match[2]
            }
          }],
          metadata: { orchestrated: true, fallback: true }
        };
      }
    }
    
    // Handle syntax error fixing
    if (/fix\s+(?:the\s+)?syntax\s+error\s+in\s+(\S+\.js)/i.test(input)) {
      const match = input.match(/fix\s+(?:the\s+)?syntax\s+error\s+in\s+(\S+\.js)/i);
      if (match) {
        return {
          toolCalls: [{
            tool: 'fixSyntaxError',
            parameters: {
              path: match[1]
            }
          }],
          metadata: { orchestrated: true, fallback: true }
        };
      }
    }
    
    // Enhanced fallback with semantic understanding
    const simplePrompt = `Understand what the user wants through semantic analysis:

User said: "${context.userInput}"
System: ${osInfo.name} (${osInfo.platform})

SEMANTIC ANALYSIS STEPS:
1. What is the SUBJECT? (What are they asking about)
2. What is the SOURCE? (Where should this info come from)
3. What is the ACTION? (What should be done)

REASONING EXAMPLES:
- "Проверь погоду на Ямайке" -> Subject: weather in Jamaica -> Source: internet -> Action: search -> Tool: webSearch
- "Show current directory" -> Subject: current directory -> Source: system -> Action: get info -> Tool: bash with pwd
- "How many processes" -> Subject: process count -> Source: system -> Action: count -> Tool: bash with ${osInfo.isWindows ? '(Get-Process).Count' : 'ps aux | wc -l'}
- "Show top processes by memory" -> Subject: processes by memory -> Source: system -> Action: list -> Tool: bash with ${osInfo.isMac ? 'ps aux | sort -nrk 4 | head' : osInfo.isLinux ? 'ps aux --sort=-%mem | head' : 'Get-Process | Sort-Object -Property WS -Descending | Select-Object -First 10'}
- "Latest news about AI" -> Subject: AI news -> Source: internet -> Action: search -> Tool: webSearch
- "Покажи файлы на диске в папке" -> Subject: files in folder -> Source: system -> Action: list -> Tool: bash with ${osInfo.isWindows ? 'dir' : 'ls -la'}
- "Show files in this directory" -> Subject: directory contents -> Source: system -> Action: list -> Tool: bash with ${osInfo.isWindows ? 'dir' : 'ls'}
- "Создай файл readme.txt и напиши там 'Hello World'" -> Subject: file creation -> Action: create -> Tool: writeFile with path:"readme.txt" content:"Hello World"
- "Create файл test.js с кодом console.log('hi')" -> Subject: file creation -> Action: create -> Tool: writeFile

DO NOT use pattern matching. UNDERSTAND the semantic meaning and intent.

Based on your understanding, respond in JSON:
{
  "reasoning": "explain your semantic understanding",
  "action": "execute" or "createFile" or "search" or "chat",
  "tool": "bash" or "writeFile" or "webSearch" or null,
  "command": "exact command if bash (e.g., 'ls', 'pwd', not 'ls or ls -la')",
  "filename": "filename if creating file", 
  "content": "file content if creating file",
  "query": "search query if webSearch",
  "message": "only if can't execute"
}

IMPORTANT: For file/directory listing, use action:"execute" with tool:"bash" and a specific command like "ls" or "ls -la"`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: `You are a semantic understanding assistant. Analyze requests based on MEANING, not keywords. Understand: 1) What information/action is requested, 2) Where it should come from (internet vs local system), 3) What tool best serves this purpose. 

IMPORTANT: Generate OS-appropriate commands for ${osInfo.name}:
${osInfo.isMac ? '- For process sorting: ps aux | sort -nrk 4 (memory) or ps aux | sort -nrk 3 (CPU)' : ''}
${osInfo.isLinux ? '- For process sorting: ps aux --sort=-%mem or ps aux --sort=-%cpu' : ''}
${osInfo.isWindows ? '- For processes: Get-Process | Sort-Object -Property WS/CPU' : ''}

ALWAYS respond with valid JSON including your reasoning. Do not wrap in markdown code blocks.` },
        { role: 'user', content: simplePrompt }
      ]);

      // Clean markdown code blocks if present
      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const parsed = JSON.parse(cleanedContent.trim());
      
      if (parsed.action === 'execute' && parsed.tool === 'bash' && parsed.command) {
        return {
          toolCalls: [{
            tool: 'bash',
            parameters: { command: parsed.command }
          }],
          metadata: { orchestrated: true, fallback: true }
        };
      }
      
      if (parsed.action === 'search' && parsed.tool === 'webSearch' && parsed.query) {
        return {
          toolCalls: [{
            tool: 'webSearch',
            parameters: { query: parsed.query }
          }],
          metadata: { orchestrated: true, fallback: true }
        };
      }
      
      if (parsed.action === 'createFile' && parsed.tool === 'writeFile' && parsed.filename) {
        let content = parsed.content || '';
        
        // Try to extract content from user input if not provided
        if (!content) {
          // Look for content in quotes
          const contentMatch = context.userInput.match(/["']([^"']+)["']/);
          if (contentMatch) {
            content = contentMatch[1];
          }
          // Generate content based on file type if still not provided
          else if (parsed.filename.includes('server') && parsed.filename.endsWith('.js')) {
            content = this.generateExpressServer();
          }
        }
        
        return {
          toolCalls: [{
            tool: 'writeFile',
            parameters: { 
              path: parsed.filename,
              content: content
            }
          }],
          metadata: { orchestrated: true, fallback: true }
        };
      }
      
      return {
        message: parsed.message || response.content,
        metadata: { orchestrated: true, fallback: true }
      };
    } catch (error) {
      // If JSON parsing fails, return the raw response
      const response = await this.provider.chat([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: `The user said: "${context.userInput}". How can I help?` }
      ]);
      
      return {
        message: response.content,
        metadata: { orchestrated: true, fallback: true }
      };
    }
  }

  private getConversationalResponse(input: string): string {
    const lowerInput = input.toLowerCase();
    
    // Handle greetings and identity questions
    if (/привет|hello|hi|здравствуй/.test(lowerInput)) {
      return 'Привет! Я LM Studio Assistant - ваш локальный AI помощник. Я могу помочь с файлами, поиском информации, выполнением команд и анализом кода.';
    }
    
    if (/как.*зовут|как.*имя|who are you|what.*name/.test(lowerInput)) {
      return 'Меня зовут LM Studio Assistant. Я локальный AI ассистент, работающий через LM Studio.';
    }
    
    if (/что это|what is this/.test(lowerInput)) {
      return 'Не совсем понимаю, о чем вы спрашиваете. Можете уточнить, что именно вас интересует?';
    }
    
    // Default response for unclear requests
    return 'Я не совсем понял ваш запрос. Можете сформулировать иначе или уточнить, что именно вы хотите сделать?';
  }
  
  private generateExpressServer(): string {
    return `const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`Server is running on port \${PORT}\`);
});

module.exports = app;`;
  }
}