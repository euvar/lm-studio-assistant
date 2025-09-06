export class UniversalReasoningPrompt {
  static generate(userInput: string, availableTools: string): string {
    // Core reasoning structure that should work with any model
    return `You are LM Studio Assistant, a helpful AI running locally. Analyze this request carefully.

Request: "${userInput}"

Step 1: Intent Classification
What is the primary intent?
a) Conversation/Chat - casual talk, questions about you, greetings, general chat
b) Information Seeking - explicitly asks to search/find information online
c) Action Required - needs to use tools for files, commands, or analysis

Step 2: Decision Logic
- For casual conversation (including slang, informal language): Always respond directly, conversationally
- For information seeking: Only use webSearch if user explicitly says "search", "find", "look up"
- For actions: Use appropriate tool

Step 3: Output Format
Based on your analysis, output ONE of these:

For conversation (most common case):
REASONING: This is a conversational request
ANSWER: [Your natural, helpful response in the user's language and style]

For tool usage (only when necessary):
REASONING: [Why this specific tool is needed]
USE_TOOL: {"name": "toolName", "params": {...}}

Available tools:
${availableTools}

IMPORTANT: Default to conversation. Only use tools when explicitly requested or for file/command operations.`;
  }

  static generateModelSpecific(modelName: string, userInput: string, availableTools: string): string {
    const modelLower = modelName.toLowerCase();
    
    // Detect model family and adjust prompt style
    if (modelLower.includes('qwen') || modelLower.includes('coder')) {
      return this.generateCoderStyle(userInput, availableTools);
    } else if (modelLower.includes('deepseek')) {
      return this.generateDeepSeekStyle(userInput, availableTools);
    } else if (modelLower.includes('llama') || modelLower.includes('mistral')) {
      return this.generateInstructStyle(userInput, availableTools);
    } else if (modelLower.includes('gpt') || modelLower.includes('claude')) {
      return this.generateAssistantStyle(userInput, availableTools);
    }
    
    // Default to universal format
    return this.generate(userInput, availableTools);
  }

  private static generateCoderStyle(userInput: string, availableTools: string): string {
    return `# Task Analysis
Input: "${userInput}"

## First, check if this is just conversation:
- Casual questions, slang (чуешь, знаешь, etc) → Just answer conversationally
- Greetings or questions about the assistant → Answer directly
- General knowledge or opinions → Answer without tools

## If not conversation, check for tool triggers:
- Contains "найди", "поищи", "search", "find" → Use webSearch
- Contains "файлы", "files", "покажи", "показать", "list", "папка", "folder", "directory" → Use listFiles
- Contains "создай файл", "create file", "запиши" → Use writeFile
- Contains "прочитай", "read", "открой файл" → Use readFile
- Contains "измени", "отредактируй", "edit" → Use editFile
- Contains "удали", "delete", "remove" → Use deleteFile
- Contains "запусти", "run", "execute", "выполни" → Use bash or runCode
- Contains "ошибка", "error", "debug", "исправь", "fix" → Use readFile then editFile
- Contains "проект", "project", "анализ", "analyze", "обзор", "overview" → Use analyzeProject

## Output Format

For conversation (default):
REASONING: This is a conversational request
ANSWER: [Your natural response]

For tools (only when explicitly needed):
REASONING: [why this tool]
USE_TOOL: {"name": "toolName", "params": {...}}

Examples:
- "Чуешь?" → REASONING: This is a conversational request
  ANSWER: Да, чую! Чем могу помочь?
- "Покажи файлы" → USE_TOOL: {"name": "listFiles", "params": {"path": "."}}
- "Что можешь сказать по этому проекту?" → USE_TOOL: {"name": "analyzeProject", "params": {"path": "."}}`;
  }

  private static generateDeepSeekStyle(userInput: string, availableTools: string): string {
    return `<thinking>
User request: "${userInput}"

Let me analyze what the user wants:
1. Is this a greeting or casual conversation?
2. Are they asking about my identity or capabilities?
3. Do they need current/real-time information?
4. Are they explicitly asking me to search or find something?
5. Do they need file operations?

Key indicators for tool usage:
- Explicit search words: search, find, look up, найди, поищи
- Current info markers: now, today, current, сейчас, сегодня
- File operations: files, folder, directory, файлы, папка
</thinking>

Based on analysis, provide:

No tools needed:
THOUGHT: [reasoning]
DIRECT_ANSWER: [response]

Tools needed:
THOUGHT: [reasoning]
TOOL: {"function": "name", "arguments": {...}}

Available: ${availableTools}`;
  }

  private static generateInstructStyle(userInput: string, availableTools: string): string {
    return `[INST] Analyze user request and decide on action.

User said: "${userInput}"

Instructions:
1. Identify if tools are needed
2. Only use tools for:
   - Explicit search requests (must contain search/find/найти/поискать)
   - File operations when asked
   - Current information that changes (weather, prices, news)
3. For everything else, respond directly

Output format:

Without tools:
CLASSIFICATION: NO_TOOLS_NEEDED
REPLY: [your response]

With tools:
CLASSIFICATION: TOOL_REQUIRED
ACTION: {"tool": "name", "parameters": {...}}

Tools available: ${availableTools}
[/INST]`;
  }

  private static generateAssistantStyle(userInput: string, availableTools: string): string {
    return `You are analyzing a user request to determine if tools are needed.

User: "${userInput}"

Guidelines:
- Default to NOT using tools unless explicitly needed
- Greetings, identity questions, general knowledge → respond directly
- Only use web search if user says: search, find, look up, найти, поискать
- Current info (weather, prices) → only if explicitly asked

Respond in this format:

No tools:
DECISION: RESPOND_DIRECTLY
MESSAGE: [your response]

With tools:
DECISION: USE_TOOL
TOOL_CONFIG: {"tool": "name", "params": {...}}

Available tools: ${availableTools}`;
  }

  // Pattern detection for better intent recognition
  static detectExplicitSearchIntent(input: string): boolean {
    const searchPatterns = [
      // Explicit search commands
      /\b(search|find|look up|google|check online|browse|найди|найти|поищи|поискать|погугли)\b/i,
      
      // Questions about current state
      /\b(what is|what's|какой|какая|какое)\b.*\b(current|latest|now|today|сейчас|сегодня|текущий)\b/i,
      
      // Weather queries
      /\b(weather|погода)\b/i,
      
      // Price/currency queries
      /\b(price|цена|курс|cost|стоимость)\b.*\b(bitcoin|btc|usd|eur|евро|доллар|биткоин)\b/i,
      
      // Current events
      /\b(who is|кто)\b.*\b(president|президент|currently|сейчас)\b/i,
      
      // File operations
      /\b(show|list|покажи|выведи|покажите)\b.*\b(files|файл|folder|папк|directory|директор)\b/i,
      /\b(files|файлы)\b.*\b(in|в)\b/i
    ];
    
    return searchPatterns.some(pattern => pattern.test(input));
  }

  static detectConversationalIntent(input: string): boolean {
    const conversationPatterns = [
      // Greetings
      /^(hi|hello|hey|привет|здравствуй|добрый|доброе)/i,
      
      // Identity
      /\b(who|what|кто|что)\b.*\b(are you|ты|вы)\b/i,
      /\b(your name|как тебя зовут|как вас зовут)\b/i,
      
      // Help/capabilities
      /\b(help|помоги|помощь|можешь|умеешь)\b/i,
      /\b(what can you|что ты можешь|что умеешь)\b/i,
      
      // General questions
      /^(tell me about|расскажи о|что такое|explain)\b/i
    ];
    
    return conversationPatterns.some(pattern => pattern.test(input));
  }
}