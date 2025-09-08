# План рефакторинга: Переход на LLM Tool Use

## Цель
Заменить все захардкоженные строки и паттерны на систему tool use для LLM, что позволит:
- Убрать константы из кода
- Сделать систему более гибкой и расширяемой
- Использовать современные подходы к работе с LLM (function calling)
- Улучшить точность определения намерений пользователя

## Текущая проблема
Сейчас в проекте используются захардкоженные регулярные выражения и строки для определения намерений:
```typescript
const searchPatterns = [
  /найди|найти|поищи|поискать|search|find|look up/,
  /погода|weather/,
  // и т.д.
];
```

## Новый подход: LLM Tool Definitions

### 1. Структура Tool Definition
```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      required?: boolean;
    }>;
    required?: string[];
  };
}
```

### 2. Архитектура решения

#### 2.1 Создание системы Tool Registry
```typescript
// src/core/tool-registry.ts
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  
  register(tool: ToolDefinition): void;
  getTools(): ToolDefinition[];
  getTool(name: string): ToolDefinition | undefined;
}
```

#### 2.2 Интеграция с LLM Provider
```typescript
// src/core/llm-tool-caller.ts
class LLMToolCaller {
  async determineToolCall(
    userInput: string,
    availableTools: ToolDefinition[],
    context?: any
  ): Promise<ToolCall[]>;
}
```

#### 2.3 Обновление агентов
Вместо canHandle() с регулярками, агенты будут регистрировать свои инструменты:
```typescript
class SearchAgent extends BaseAgent {
  getToolDefinitions(): ToolDefinition[] {
    return [{
      name: 'web_search',
      description: 'Поиск информации в интернете',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос'
          }
        },
        required: ['query']
      }
    }];
  }
}
```

## План реализации

### Этап 1: Создание базовой инфраструктуры
1. **Создать интерфейсы и типы** (`src/types/tool-definitions.ts`)
   - ToolDefinition
   - ToolCall
   - ToolResult
   
2. **Создать ToolRegistry** (`src/core/tool-registry.ts`)
   - Регистрация инструментов
   - Получение списка доступных инструментов
   
3. **Создать LLMToolCaller** (`src/core/llm-tool-caller.ts`)
   - Интеграция с LM Studio API
   - Определение необходимых tool calls на основе ввода пользователя

### Этап 2: Рефакторинг агентов
1. **BaseAgent** - добавить метод getToolDefinitions()
2. **SearchAgent** - заменить паттерны на tool definitions
3. **FileAgent** - заменить паттерны на tool definitions
4. **CodeAgent** - заменить паттерны на tool definitions
5. **Остальные агенты** - аналогично

### Этап 3: Обновление Orchestrator
1. Собирать все tool definitions от агентов
2. Использовать LLMToolCaller для определения какие инструменты вызвать
3. Маршрутизировать вызовы к соответствующим агентам

### Этап 4: Миграция существующих паттернов
Преобразовать существующие регулярные выражения в описания для LLM:

**Было:**
```typescript
/найди|найти|поищи|поискать|search|find|look up/
```

**Стало:**
```typescript
{
  name: 'web_search',
  description: 'Используйте этот инструмент когда пользователь хочет найти информацию, выполнить поиск, узнать актуальные данные. Ключевые слова: найди, поищи, search, find, look up, погода, курс, новости',
  parameters: {...}
}
```

### Этап 5: Создание системы динамической регистрации
1. Загрузка tool definitions из конфигурационных файлов
2. Возможность расширения без изменения кода
3. Поддержка плагинов

## Преимущества нового подхода

1. **Гибкость** - легко добавлять новые инструменты без изменения кода
2. **Точность** - LLM лучше понимает контекст, чем регулярные выражения
3. **Многоязычность** - автоматическая поддержка разных языков
4. **Стандартизация** - соответствие современным практикам (OpenAI, Anthropic)
5. **Расширяемость** - легко интегрировать новые возможности

## Примеры tool definitions для агентов

### SearchAgent
```typescript
[{
  name: 'web_search',
  description: 'Поиск актуальной информации в интернете',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Что искать'
      }
    }
  }
}]
```

### FileAgent
```typescript
[{
  name: 'list_files',
  description: 'Показать список файлов в директории',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Путь к директории'
      }
    }
  }
}, {
  name: 'read_file',
  description: 'Прочитать содержимое файла',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Путь к файлу'
      }
    }
  }
}, {
  name: 'write_file',
  description: 'Записать или создать файл',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Путь к файлу'
      },
      content: {
        type: 'string',
        description: 'Содержимое файла'
      }
    }
  }
}]
```

### CodeAgent
```typescript
[{
  name: 'run_code',
  description: 'Выполнить код на указанном языке программирования',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'typescript', 'python', 'bash'],
        description: 'Язык программирования'
      },
      code: {
        type: 'string',
        description: 'Код для выполнения'
      }
    }
  }
}, {
  name: 'create_project',
  description: 'Создать новый проект',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Название проекта'
      },
      type: {
        type: 'string',
        enum: ['node', 'react', 'python', 'express'],
        description: 'Тип проекта'
      }
    }
  }
}]
```

## Порядок выполнения

1. ✅ Изучить best practices для tool use
2. 📝 Создать план рефакторинга (этот файл)
3. Создать базовые интерфейсы и типы
4. Реализовать ToolRegistry
5. Реализовать LLMToolCaller
6. Обновить BaseAgent
7. Рефакторить SearchAgent
8. Рефакторить FileAgent
9. Рефакторить CodeAgent
10. Рефакторить остальных агентов
11. Обновить OrchestratorAgent
12. Провести тестирование
13. Написать документацию

## Критерии успеха

- Все захардкоженные паттерны удалены из кода
- Система использует tool definitions для всех операций
- LLM определяет какие инструменты вызвать на основе описаний
- Легко добавлять новые инструменты без изменения кода
- Сохранена вся существующая функциональность