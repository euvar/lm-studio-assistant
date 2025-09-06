import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface LanguagePack {
  code: string;
  name: string;
  nativeName: string;
  prompts: Record<string, string>;
  ui: Record<string, string>;
  errors: Record<string, string>;
  tools: Record<string, ToolTranslation>;
}

interface ToolTranslation {
  name: string;
  description: string;
  parameters: Record<string, string>;
}

export class MultiLanguageSupport extends EventEmitter {
  private languages: Map<string, LanguagePack> = new Map();
  private currentLanguage: string = 'en';
  private fallbackLanguage: string = 'en';
  private languagesPath: string;

  constructor(languagesPath: string) {
    super();
    this.languagesPath = languagesPath;
    this.initializeDefaultLanguages();
  }

  private initializeDefaultLanguages() {
    // English (default)
    const english: LanguagePack = {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      prompts: {
        greeting: 'Hello! How can I help you today?',
        thinking: 'Thinking...',
        error: 'Sorry, an error occurred: {error}',
        success: 'Task completed successfully!',
        confirm: 'Are you sure you want to {action}?',
        fileCreated: 'File created: {path}',
        fileDeleted: 'File deleted: {path}',
        searchResults: 'Found {count} results for "{query}"',
        noResults: 'No results found',
        executingCommand: 'Executing: {command}',
        analysisComplete: 'Analysis complete. {summary}',
        suggestion: 'Suggestion: {text}',
        taskStarted: 'Started: {task}',
        taskCompleted: 'Completed: {task}',
        intentDetected: 'I understand you want to {intent}'
      },
      ui: {
        yes: 'Yes',
        no: 'No',
        cancel: 'Cancel',
        continue: 'Continue',
        back: 'Back',
        next: 'Next',
        finish: 'Finish',
        retry: 'Retry',
        help: 'Help',
        settings: 'Settings',
        language: 'Language',
        theme: 'Theme',
        about: 'About'
      },
      errors: {
        fileNotFound: 'File not found: {path}',
        permissionDenied: 'Permission denied: {action}',
        invalidInput: 'Invalid input: {input}',
        networkError: 'Network error: {message}',
        timeout: 'Operation timed out',
        syntaxError: 'Syntax error in {file} at line {line}',
        commandFailed: 'Command failed: {command}',
        toolNotFound: 'Tool not found: {tool}'
      },
      tools: {
        bash: {
          name: 'Bash',
          description: 'Execute shell commands',
          parameters: {
            command: 'The command to execute'
          }
        },
        writeFile: {
          name: 'Write File',
          description: 'Create or overwrite a file',
          parameters: {
            path: 'File path',
            content: 'File content'
          }
        },
        webSearch: {
          name: 'Web Search',
          description: 'Search the internet',
          parameters: {
            query: 'Search query'
          }
        }
      }
    };

    // Russian
    const russian: LanguagePack = {
      code: 'ru',
      name: 'Russian',
      nativeName: 'Русский',
      prompts: {
        greeting: 'Привет! Чем могу помочь?',
        thinking: 'Думаю...',
        error: 'Извините, произошла ошибка: {error}',
        success: 'Задача выполнена успешно!',
        confirm: 'Вы уверены, что хотите {action}?',
        fileCreated: 'Файл создан: {path}',
        fileDeleted: 'Файл удалён: {path}',
        searchResults: 'Найдено {count} результатов по запросу "{query}"',
        noResults: 'Результатов не найдено',
        executingCommand: 'Выполняю: {command}',
        analysisComplete: 'Анализ завершён. {summary}',
        suggestion: 'Предложение: {text}',
        taskStarted: 'Начато: {task}',
        taskCompleted: 'Завершено: {task}',
        intentDetected: 'Понимаю, вы хотите {intent}'
      },
      ui: {
        yes: 'Да',
        no: 'Нет',
        cancel: 'Отмена',
        continue: 'Продолжить',
        back: 'Назад',
        next: 'Далее',
        finish: 'Завершить',
        retry: 'Повторить',
        help: 'Помощь',
        settings: 'Настройки',
        language: 'Язык',
        theme: 'Тема',
        about: 'О программе'
      },
      errors: {
        fileNotFound: 'Файл не найден: {path}',
        permissionDenied: 'Доступ запрещён: {action}',
        invalidInput: 'Неверный ввод: {input}',
        networkError: 'Ошибка сети: {message}',
        timeout: 'Превышено время ожидания',
        syntaxError: 'Синтаксическая ошибка в {file} на строке {line}',
        commandFailed: 'Команда не выполнена: {command}',
        toolNotFound: 'Инструмент не найден: {tool}'
      },
      tools: {
        bash: {
          name: 'Bash',
          description: 'Выполнить команду оболочки',
          parameters: {
            command: 'Команда для выполнения'
          }
        },
        writeFile: {
          name: 'Записать файл',
          description: 'Создать или перезаписать файл',
          parameters: {
            path: 'Путь к файлу',
            content: 'Содержимое файла'
          }
        },
        webSearch: {
          name: 'Поиск в интернете',
          description: 'Искать в интернете',
          parameters: {
            query: 'Поисковый запрос'
          }
        }
      }
    };

    // Spanish
    const spanish: LanguagePack = {
      code: 'es',
      name: 'Spanish',
      nativeName: 'Español',
      prompts: {
        greeting: '¡Hola! ¿En qué puedo ayudarte?',
        thinking: 'Pensando...',
        error: 'Lo siento, ocurrió un error: {error}',
        success: '¡Tarea completada con éxito!',
        confirm: '¿Estás seguro de que quieres {action}?',
        fileCreated: 'Archivo creado: {path}',
        fileDeleted: 'Archivo eliminado: {path}',
        searchResults: 'Se encontraron {count} resultados para "{query}"',
        noResults: 'No se encontraron resultados',
        executingCommand: 'Ejecutando: {command}',
        analysisComplete: 'Análisis completo. {summary}',
        suggestion: 'Sugerencia: {text}',
        taskStarted: 'Iniciado: {task}',
        taskCompleted: 'Completado: {task}',
        intentDetected: 'Entiendo que quieres {intent}'
      },
      ui: {
        yes: 'Sí',
        no: 'No',
        cancel: 'Cancelar',
        continue: 'Continuar',
        back: 'Atrás',
        next: 'Siguiente',
        finish: 'Finalizar',
        retry: 'Reintentar',
        help: 'Ayuda',
        settings: 'Configuración',
        language: 'Idioma',
        theme: 'Tema',
        about: 'Acerca de'
      },
      errors: {
        fileNotFound: 'Archivo no encontrado: {path}',
        permissionDenied: 'Permiso denegado: {action}',
        invalidInput: 'Entrada inválida: {input}',
        networkError: 'Error de red: {message}',
        timeout: 'Tiempo de espera agotado',
        syntaxError: 'Error de sintaxis en {file} en la línea {line}',
        commandFailed: 'El comando falló: {command}',
        toolNotFound: 'Herramienta no encontrada: {tool}'
      },
      tools: {
        bash: {
          name: 'Bash',
          description: 'Ejecutar comandos de shell',
          parameters: {
            command: 'El comando a ejecutar'
          }
        },
        writeFile: {
          name: 'Escribir archivo',
          description: 'Crear o sobrescribir un archivo',
          parameters: {
            path: 'Ruta del archivo',
            content: 'Contenido del archivo'
          }
        },
        webSearch: {
          name: 'Búsqueda web',
          description: 'Buscar en Internet',
          parameters: {
            query: 'Consulta de búsqueda'
          }
        }
      }
    };

    this.languages.set('en', english);
    this.languages.set('ru', russian);
    this.languages.set('es', spanish);
  }

  async loadLanguagesFromDisk() {
    try {
      await fs.mkdir(this.languagesPath, { recursive: true });
      const files = await fs.readdir(this.languagesPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const langCode = file.replace('.json', '');
          const content = await fs.readFile(
            path.join(this.languagesPath, file),
            'utf-8'
          );
          const languagePack = JSON.parse(content) as LanguagePack;
          this.languages.set(langCode, languagePack);
        }
      }
    } catch (error) {
      console.error('Failed to load languages from disk:', error);
    }
  }

  setLanguage(code: string): boolean {
    if (this.languages.has(code)) {
      this.currentLanguage = code;
      this.emit('languageChanged', code);
      return true;
    }
    return false;
  }

  getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  getAvailableLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return Array.from(this.languages.values()).map(lang => ({
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName
    }));
  }

  // Get translated string with variable substitution
  t(key: string, category: 'prompts' | 'ui' | 'errors' = 'prompts', variables?: Record<string, any>): string {
    const lang = this.languages.get(this.currentLanguage) || this.languages.get(this.fallbackLanguage)!;
    let text = lang[category]?.[key] || `[Missing translation: ${key}]`;
    
    // Variable substitution
    if (variables) {
      for (const [varKey, value] of Object.entries(variables)) {
        text = text.replace(new RegExp(`\\{${varKey}\\}`, 'g'), String(value));
      }
    }
    
    return text;
  }

  // Get tool translation
  getToolTranslation(toolName: string): ToolTranslation | undefined {
    const lang = this.languages.get(this.currentLanguage) || this.languages.get(this.fallbackLanguage)!;
    return lang.tools[toolName];
  }

  // Detect user's language from input
  async detectLanguage(text: string): Promise<string> {
    // Simple language detection based on character sets and common words
    const languagePatterns = {
      ru: /[а-яА-ЯёЁ]/,
      es: /[ñáéíóúü]/i,
      fr: /[àâçèéêëîïôùûü]/i,
      de: /[äöüßÄÖÜ]/,
      ja: /[\u3040-\u309F\u30A0-\u30FF]/,
      zh: /[\u4E00-\u9FFF]/,
      ko: /[\uAC00-\uD7AF]/
    };

    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    // Check for common words
    const commonWords = {
      ru: ['привет', 'как', 'что', 'где', 'когда', 'почему', 'сделать', 'создать', 'удалить'],
      es: ['hola', 'cómo', 'qué', 'dónde', 'cuándo', 'por qué', 'hacer', 'crear', 'borrar'],
      fr: ['bonjour', 'comment', 'quoi', 'où', 'quand', 'pourquoi', 'faire', 'créer', 'supprimer']
    };

    const lowerText = text.toLowerCase();
    for (const [lang, words] of Object.entries(commonWords)) {
      if (words.some(word => lowerText.includes(word))) {
        return lang;
      }
    }

    return 'en'; // Default to English
  }

  // Auto-detect and switch language based on user input
  async autoDetectAndSwitch(text: string): Promise<string> {
    const detectedLang = await this.detectLanguage(text);
    
    if (detectedLang !== this.currentLanguage && this.languages.has(detectedLang)) {
      this.setLanguage(detectedLang);
      console.log(`Language auto-switched to: ${detectedLang}`);
    }
    
    return detectedLang;
  }

  // Generate language-specific prompts for AI
  generateSystemPrompt(): string {
    const lang = this.languages.get(this.currentLanguage) || this.languages.get('en')!;
    
    const systemPrompts: Record<string, string> = {
      en: `You are a helpful AI assistant. Respond in English unless the user switches languages.`,
      ru: `Вы полезный ИИ-ассистент. Отвечайте на русском языке, если пользователь не переключит язык.`,
      es: `Eres un asistente de IA útil. Responde en español a menos que el usuario cambie de idioma.`,
    };

    return systemPrompts[lang.code] || systemPrompts.en;
  }

  // Format numbers, dates, and currencies according to locale
  formatNumber(num: number): string {
    const locales = {
      en: 'en-US',
      ru: 'ru-RU',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ja: 'ja-JP',
      zh: 'zh-CN',
      ko: 'ko-KR'
    };

    const locale = locales[this.currentLanguage as keyof typeof locales] || 'en-US';
    return new Intl.NumberFormat(locale).format(num);
  }

  formatDate(date: Date): string {
    const locales = {
      en: 'en-US',
      ru: 'ru-RU',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ja: 'ja-JP',
      zh: 'zh-CN',
      ko: 'ko-KR'
    };

    const locale = locales[this.currentLanguage as keyof typeof locales] || 'en-US';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  // Create a new language pack template
  async createLanguageTemplate(code: string, name: string, nativeName: string): Promise<void> {
    const template: LanguagePack = {
      code,
      name,
      nativeName,
      prompts: {},
      ui: {},
      errors: {},
      tools: {}
    };

    // Copy structure from English
    const english = this.languages.get('en')!;
    
    for (const key of Object.keys(english.prompts)) {
      template.prompts[key] = `[Translate: ${english.prompts[key]}]`;
    }
    
    for (const key of Object.keys(english.ui)) {
      template.ui[key] = `[Translate: ${english.ui[key]}]`;
    }
    
    for (const key of Object.keys(english.errors)) {
      template.errors[key] = `[Translate: ${english.errors[key]}]`;
    }
    
    for (const [toolKey, tool] of Object.entries(english.tools)) {
      template.tools[toolKey] = {
        name: `[Translate: ${tool.name}]`,
        description: `[Translate: ${tool.description}]`,
        parameters: {}
      };
      
      for (const [paramKey, param] of Object.entries(tool.parameters)) {
        template.tools[toolKey].parameters[paramKey] = `[Translate: ${param}]`;
      }
    }

    // Save to file
    await fs.writeFile(
      path.join(this.languagesPath, `${code}.json`),
      JSON.stringify(template, null, 2)
    );
  }
}