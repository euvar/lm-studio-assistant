# Руководство по миграции на LLM Tool Use

## Обзор изменений

Мы переходим от захардкоженных регулярных выражений к системе tool definitions, где LLM сам определяет какие инструменты использовать на основе их описаний.

## Что изменилось

### Было (старый подход):
```typescript
// Агент с захардкоженными паттернами
export class SearchAgent extends BaseAgent {
  async canHandle(context: AgentContext): Promise<boolean> {
    const searchPatterns = [
      /найди|найти|поищи|поискать|search|find|look up/,
      /погода|weather/,
      /курс|price|цена/
    ];
    return searchPatterns.some(pattern => pattern.test(input));
  }
}
```

### Стало (новый подход):
```typescript
// Агент с tool definitions
export class SearchAgentV2 extends BaseAgent {
  getToolDefinitions(): ToolDefinition[] {
    return [{
      name: 'web_search',
      description: `Performs web search... Keywords: найди, поищи, search...`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        }
      }
    }];
  }
}
```

## Пошаговая миграция агента

### Шаг 1: Импорты
```typescript
// Добавьте новые импорты
import { ToolDefinition, ToolExecutor } from '../types/tool-definitions.js';
```

### Шаг 2: Добавьте метод getToolDefinitions()
```typescript
getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'your_tool_name',
      description: `Описание что делает инструмент.
        Включите ключевые слова которые были в регулярках.
        Keywords: слово1, слово2, word3...`,
      parameters: {
        type: 'object',
        properties: {
          // Параметры инструмента
        }
      }
    }
  ];
}
```

### Шаг 3: Добавьте метод getToolExecutor()
```typescript
getToolExecutor(toolName: string): ToolExecutor | undefined {
  if (toolName === 'your_tool_name') {
    return {
      name: 'your_tool_name',
      execute: async (parameters) => {
        // Логика выполнения
        return {
          result: {
            toolCalls: [{
              tool: 'originalToolName',
              parameters: parameters
            }]
          }
        };
      }
    };
  }
  return undefined;
}
```

### Шаг 4: Упростите canHandle()
```typescript
async canHandle(context: AgentContext): Promise<boolean> {
  // Теперь orchestrator решает через LLM
  if (context.metadata?.selectedTools) {
    const ourTools = this.getToolDefinitions().map(t => t.name);
    return context.metadata.selectedTools.some((tool: string) => 
      ourTools.includes(tool)
    );
  }
  return false;
}
```

### Шаг 5: Обновите process()
```typescript
async process(context: AgentContext): Promise<AgentResponse> {
  if (context.metadata?.toolCall) {
    const toolCall = context.metadata.toolCall;
    const executor = this.getToolExecutor(toolCall.tool);
    
    if (executor) {
      const result = await executor.execute(toolCall.parameters);
      return result.result;
    }
  }
  
  // Fallback логика
  return { message: 'Unable to process request' };
}
```

## Примеры миграции

### Пример 1: Простой паттерн
**Было:**
```typescript
if (/создай.*файл|create.*file/.test(input)) {
  return true;
}
```

**Стало:**
```typescript
{
  name: 'create_file',
  description: 'Creates a new file. Keywords: создай файл, create file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'File content' }
    }
  }
}
```

### Пример 2: Сложный паттерн с вариантами
**Было:**
```typescript
const patterns = [
  /запусти|run|execute/,
  /команд|command|bash/,
  /скрипт|script/
];
```

**Стало:**
```typescript
{
  name: 'run_command',
  description: `Executes commands and scripts.
    Use for: running commands, executing bash, launching scripts.
    Keywords: запусти, run, execute, команда, command, bash, скрипт, script`,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' }
    }
  }
}
```

## Интеграция с Orchestrator

Новый Orchestrator автоматически:
1. Собирает все tool definitions от агентов
2. Передает их в LLM для анализа
3. Получает решение какие tools использовать
4. Направляет запросы к соответствующим агентам

## Проверочный чеклист

- [ ] Все регулярные выражения преобразованы в описания tool
- [ ] Добавлен метод getToolDefinitions()
- [ ] Добавлен метод getToolExecutor()
- [ ] Обновлен метод canHandle()
- [ ] Обновлен метод process()
- [ ] Удалены старые паттерны
- [ ] Протестирована работа с новым Orchestrator

## Преимущества после миграции

1. **Гибкость** - легко добавлять новые возможности
2. **Точность** - LLM лучше понимает намерения
3. **Многоязычность** - автоматическая поддержка языков
4. **Расширяемость** - простое добавление новых tools
5. **Стандартизация** - соответствие best practices

## Обратная совместимость

Для постепенной миграции можно:
1. Создавать новые версии агентов (AgentV2)
2. Поддерживать оба подхода временно
3. Постепенно переключаться на новые версии

## Отладка

Для отладки tool selection:
```typescript
// В LLMToolCaller можно включить debug режим
const response = await this.llmToolCaller.determineToolCall({
  userInput: 'тестовый запрос',
  availableTools: tools,
  context: { debug: true }
});

console.log('Selected tools:', response.toolCalls);
console.log('Reasoning:', response.reasoning);
```