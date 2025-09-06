# Руководство по реализации LM Studio Assistant

## Шаг 1: Настройка проекта

### Инициализация
```bash
npm init -y
npm install typescript @types/node tsx
npm install axios chalk inquirer ora
npm install -D @types/inquirer eslint prettier
```

### TypeScript конфигурация (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Шаг 2: Базовая интеграция с LM Studio

### src/providers/lmstudio.ts
```typescript
import axios from 'axios';

export class LMStudioProvider {
  private baseURL: string;
  private currentModel: string | null = null;

  constructor(baseURL = 'http://localhost:1234/v1') {
    this.baseURL = baseURL;
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseURL}/models`);
      return response.data.data.map((model: any) => model.id);
    } catch (error) {
      throw new Error('Failed to connect to LM Studio');
    }
  }

  async chat(messages: any[], tools?: any[]) {
    const response = await axios.post(`${this.baseURL}/chat/completions`, {
      model: this.currentModel,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: false
    });
    
    return response.data.choices[0].message;
  }
}
```

## Шаг 3: Система инструментов

### src/tools/base.ts
```typescript
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllDefinitions() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
}
```

### src/tools/filesystem.ts
```typescript
import fs from 'fs/promises';
import path from 'path';

export const readFileTool: Tool = {
  name: 'readFile',
  description: 'Read contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' }
    },
    required: ['path']
  },
  async execute({ path: filePath }) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const writeFileTool: Tool = {
  name: 'writeFile',
  description: 'Write content to a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'Content to write' }
    },
    required: ['path', 'content']
  },
  async execute({ path: filePath, content }) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true, message: 'File written successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
```

## Шаг 4: Основной агент

### src/core/agent.ts
```typescript
export class Agent {
  private provider: LMStudioProvider;
  private toolRegistry: ToolRegistry;
  private conversationHistory: Message[] = [];

  constructor(provider: LMStudioProvider, toolRegistry: ToolRegistry) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
  }

  async processUserInput(input: string) {
    // Добавляем сообщение пользователя
    this.conversationHistory.push({
      role: 'user',
      content: input
    });

    // Формируем системный промпт
    const systemPrompt = this.buildSystemPrompt();
    
    // Получаем ответ от модели
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory
    ];

    const response = await this.provider.chat(messages);
    
    // Парсим и выполняем инструменты если нужно
    const toolCalls = this.parseToolCalls(response.content);
    
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const result = await this.executeTool(call);
        // Добавляем результат в историю
        this.conversationHistory.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: call.id
        });
      }
      
      // Получаем финальный ответ
      return this.processUserInput('');
    }

    // Добавляем ответ в историю
    this.conversationHistory.push({
      role: 'assistant',
      content: response.content
    });

    return response.content;
  }

  private buildSystemPrompt(): string {
    const tools = this.toolRegistry.getAllDefinitions();
    
    return `You are a helpful AI assistant with access to tools.

Available tools:
${JSON.stringify(tools, null, 2)}

When you need to use a tool, wrap your tool calls in <tool_use> tags:
<tool_use>
{
  "tool": "toolName",
  "parameters": {
    "param": "value"
  }
}
</tool_use>

You can call multiple tools in one response.`;
  }

  private parseToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const regex = /<tool_use>(.*?)<\/tool_use>/gs;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const toolData = JSON.parse(match[1]);
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random()}`,
          tool: toolData.tool,
          parameters: toolData.parameters
        });
      } catch (error) {
        console.error('Failed to parse tool call:', error);
      }
    }
    
    return toolCalls;
  }

  private async executeTool(call: ToolCall) {
    const tool = this.toolRegistry.get(call.tool);
    if (!tool) {
      return { error: `Tool ${call.tool} not found` };
    }
    
    try {
      return await tool.execute(call.parameters);
    } catch (error) {
      return { error: error.message };
    }
  }
}
```

## Шаг 5: CLI интерфейс

### src/cli/app.ts
```typescript
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class CLIApp {
  private agent: Agent;
  private provider: LMStudioProvider;

  async start() {
    console.log(chalk.bold.blue('🤖 LM Studio Assistant'));
    
    // Подключаемся к LM Studio
    const spinner = ora('Connecting to LM Studio...').start();
    try {
      const models = await this.provider.getModels();
      spinner.succeed('Connected to LM Studio');
      
      // Выбор модели
      const { model } = await inquirer.prompt([
        {
          type: 'list',
          name: 'model',
          message: 'Select a model:',
          choices: models
        }
      ]);
      
      this.provider.setModel(model);
      console.log(chalk.green(`✓ Using model: ${model}`));
      
    } catch (error) {
      spinner.fail('Failed to connect to LM Studio');
      console.error(chalk.red('Make sure LM Studio is running'));
      process.exit(1);
    }

    // Основной цикл
    while (true) {
      const { input } = await inquirer.prompt([
        {
          type: 'input',
          name: 'input',
          message: '>',
          prefix: ''
        }
      ]);

      if (input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('Goodbye!'));
        break;
      }

      const responseSpinner = ora('Thinking...').start();
      try {
        const response = await this.agent.processUserInput(input);
        responseSpinner.stop();
        
        console.log(chalk.cyan('\nAssistant:'));
        console.log(response);
        console.log('');
        
      } catch (error) {
        responseSpinner.fail('Error processing request');
        console.error(chalk.red(error.message));
      }
    }
  }
}
```

## Шаг 6: Поиск в интернете

### src/tools/websearch.ts
```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

export const webSearchTool: Tool = {
  name: 'webSearch',
  description: 'Search the web for information',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  async execute({ query }) {
    try {
      // Используем DuckDuckGo HTML версию
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const results: any[] = [];

      $('.result').each((i, elem) => {
        if (i >= 5) return; // Топ 5 результатов
        
        const title = $(elem).find('.result__title').text().trim();
        const snippet = $(elem).find('.result__snippet').text().trim();
        const url = $(elem).find('.result__url').attr('href');
        
        if (title && url) {
          results.push({ title, snippet, url });
        }
      });

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const fetchWebPageTool: Tool = {
  name: 'fetchWebPage',
  description: 'Fetch and extract content from a web page',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' }
    },
    required: ['url']
  },
  async execute({ url }) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Удаляем скрипты и стили
      $('script, style').remove();
      
      // Извлекаем основной текст
      const title = $('title').text();
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 3000); // Ограничиваем размер

      return { 
        success: true, 
        title,
        content,
        url 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
```

## Шаг 7: Выполнение команд

### src/tools/bash.ts
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute bash commands',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' }
    },
    required: ['command']
  },
  async execute({ command }) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 секунд
        maxBuffer: 1024 * 1024 // 1MB
      });
      
      return { 
        success: true, 
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        stdout: error.stdout?.trim(),
        stderr: error.stderr?.trim()
      };
    }
  }
};
```

## Шаг 8: Точка входа

### src/index.ts
```typescript
#!/usr/bin/env node

import { LMStudioProvider } from './providers/lmstudio';
import { ToolRegistry } from './tools/base';
import { readFileTool, writeFileTool } from './tools/filesystem';
import { webSearchTool, fetchWebPageTool } from './tools/websearch';
import { bashTool } from './tools/bash';
import { Agent } from './core/agent';
import { CLIApp } from './cli/app';

async function main() {
  // Инициализация провайдера
  const provider = new LMStudioProvider();
  
  // Регистрация инструментов
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);
  toolRegistry.register(webSearchTool);
  toolRegistry.register(fetchWebPageTool);
  toolRegistry.register(bashTool);
  
  // Создание агента
  const agent = new Agent(provider, toolRegistry);
  
  // Запуск CLI
  const app = new CLIApp(agent, provider);
  await app.start();
}

main().catch(console.error);
```

## Следующие шаги

1. **Улучшение парсинга** - более надежное извлечение tool calls из ответов модели
2. **Streaming ответов** - отображение ответов по мере генерации
3. **Сохранение сессий** - возможность продолжить разговор позже
4. **Плагины** - система для добавления новых инструментов
5. **Веб интерфейс** - альтернатива CLI для удобства использования