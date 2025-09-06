import { EventEmitter } from 'events';
import natural from 'natural';
import { VectorDatabase } from './vector-database.js';

interface Intent {
  type: 'create' | 'fix' | 'optimize' | 'search' | 'explain' | 'refactor' | 'test' | 'deploy' | 'analyze' | 'unknown';
  confidence: number;
  entities: Record<string, string>;
  subIntents: string[];
  similarIntents?: Array<{ text: string; score: number; metadata?: any }>;
}

interface IntentPattern {
  patterns: RegExp[];
  type: Intent['type'];
  extractEntities?: (text: string) => Record<string, string>;
}

export class IntentUnderstanding extends EventEmitter {
  private tokenizer = new natural.WordTokenizer();
  private tfidf = new natural.TfIdf();
  private classifier = new natural.BayesClassifier();
  private intentPatterns: IntentPattern[] = [];
  private vectorDB: VectorDatabase | null = null;

  constructor() {
    super();
    this.initializePatterns();
    this.trainClassifier();
    this.initializeVectorDB();
  }

  private async initializeVectorDB() {
    try {
      this.vectorDB = new VectorDatabase({
        collectionName: 'intent_understanding',
        useLocalEmbeddings: true
      });
      await this.vectorDB.initialize();
      await this.indexTrainingData();
    } catch (error) {
      console.warn('Failed to initialize vector DB for intent understanding:', error);
    }
  }

  private async indexTrainingData() {
    if (!this.vectorDB) return;

    const intentExamples = [
      { text: 'create a new react component with hooks', type: 'create' },
      { text: 'build a REST API with authentication', type: 'create' },
      { text: 'fix the type error in the user service', type: 'fix' },
      { text: 'debug the memory leak in production', type: 'fix' },
      { text: 'optimize the database queries for better performance', type: 'optimize' },
      { text: 'improve the rendering speed of the dashboard', type: 'optimize' },
      { text: 'find all typescript files in the project', type: 'search' },
      { text: 'show me where the error is happening', type: 'search' },
      { text: 'explain how the authentication system works', type: 'explain' },
      { text: 'what is the purpose of this function', type: 'explain' },
      { text: 'refactor this code to be more maintainable', type: 'refactor' },
      { text: 'write unit tests for the user service', type: 'test' },
      { text: 'deploy the application to production', type: 'deploy' },
      { text: 'analyze the codebase for potential issues', type: 'analyze' }
    ];

    for (const example of intentExamples) {
      await this.vectorDB.addDocument({
        id: `intent_${Date.now()}_${Math.random()}`,
        text: example.text,
        metadata: {
          type: 'intent_example',
          intentType: example.type,
          timestamp: Date.now()
        }
      });
    }
  }

  private initializePatterns() {
    this.intentPatterns = [
      {
        type: 'create',
        patterns: [
          /create|build|make|generate|implement|add|write|develop|design/i,
          /новый|создать|сделать|написать|добавить/i
        ],
        extractEntities: (text) => {
          const entities: Record<string, string> = {};
          
          // Extract what to create
          const createMatch = text.match(/(?:create|build|make|add|write)\s+(?:a\s+)?(\w+(?:\s+\w+)*)/i);
          if (createMatch) {
            entities.target = createMatch[1];
          }
          
          // Extract technology/framework
          const techMatch = text.match(/(?:with|using|in)\s+(\w+)/i);
          if (techMatch) {
            entities.technology = techMatch[1];
          }
          
          return entities;
        }
      },
      {
        type: 'fix',
        patterns: [
          /fix|repair|solve|debug|resolve|correct|patch/i,
          /исправить|починить|решить|ошибка/i
        ],
        extractEntities: (text) => {
          const entities: Record<string, string> = {};
          
          // Extract error type
          const errorMatch = text.match(/(?:fix|solve|debug)\s+(?:the\s+)?(\w+(?:\s+\w+)*)/i);
          if (errorMatch) {
            entities.errorType = errorMatch[1];
          }
          
          return entities;
        }
      },
      {
        type: 'optimize',
        patterns: [
          /optimize|improve|enhance|speed up|performance|faster|better/i,
          /оптимизировать|улучшить|ускорить|быстрее/i
        ],
        extractEntities: (text) => {
          const entities: Record<string, string> = {};
          
          if (/performance|speed|faster/i.test(text)) {
            entities.aspect = 'performance';
          } else if (/memory|ram|storage/i.test(text)) {
            entities.aspect = 'memory';
          } else if (/quality|clean|readable/i.test(text)) {
            entities.aspect = 'quality';
          }
          
          return entities;
        }
      },
      {
        type: 'search',
        patterns: [
          /search|find|look for|locate|where|show|list|get/i,
          /найти|искать|показать|где/i
        ],
        extractEntities: (text) => {
          const entities: Record<string, string> = {};
          
          const searchMatch = text.match(/(?:search|find|look\s+for|show)\s+(?:all\s+)?(\w+(?:\s+\w+)*)/i);
          if (searchMatch) {
            entities.query = searchMatch[1];
          }
          
          return entities;
        }
      },
      {
        type: 'explain',
        patterns: [
          /explain|describe|what is|how does|why|understand|clarify/i,
          /объяснить|описать|что такое|как работает|почему/i
        ],
        extractEntities: (text) => {
          const entities: Record<string, string> = {};
          
          const explainMatch = text.match(/(?:explain|describe|what\s+is)\s+(?:the\s+)?(\w+(?:\s+\w+)*)/i);
          if (explainMatch) {
            entities.topic = explainMatch[1];
          }
          
          return entities;
        }
      },
      {
        type: 'refactor',
        patterns: [
          /refactor|restructure|reorganize|clean up|simplify/i,
          /рефакторинг|переписать|упростить/i
        ]
      },
      {
        type: 'test',
        patterns: [
          /test|check|verify|validate|ensure|coverage/i,
          /тест|проверить|протестировать/i
        ]
      },
      {
        type: 'deploy',
        patterns: [
          /deploy|publish|release|ship|launch|host/i,
          /развернуть|опубликовать|запустить/i
        ]
      },
      {
        type: 'analyze',
        patterns: [
          /analyze|examine|inspect|review|audit|assess/i,
          /анализировать|изучить|проверить/i
        ]
      }
    ];
  }

  private trainClassifier() {
    // Training data for the classifier
    const trainingData = [
      // Create intents
      { text: 'create a new react component', intent: 'create' },
      { text: 'build a REST API', intent: 'create' },
      { text: 'make a todo list app', intent: 'create' },
      { text: 'implement user authentication', intent: 'create' },
      
      // Fix intents
      { text: 'fix the syntax error', intent: 'fix' },
      { text: 'debug the application', intent: 'fix' },
      { text: 'solve the memory leak', intent: 'fix' },
      { text: 'resolve merge conflicts', intent: 'fix' },
      
      // Optimize intents
      { text: 'make it run faster', intent: 'optimize' },
      { text: 'improve performance', intent: 'optimize' },
      { text: 'optimize the database queries', intent: 'optimize' },
      { text: 'reduce memory usage', intent: 'optimize' },
      
      // Search intents
      { text: 'find all typescript files', intent: 'search' },
      { text: 'show me the error logs', intent: 'search' },
      { text: 'where is the config file', intent: 'search' },
      { text: 'list all functions', intent: 'search' },
      
      // Explain intents
      { text: 'explain how this works', intent: 'explain' },
      { text: 'what is dependency injection', intent: 'explain' },
      { text: 'describe the architecture', intent: 'explain' },
      { text: 'how does async await work', intent: 'explain' }
    ];
    
    // Train the classifier
    trainingData.forEach(item => {
      this.classifier.addDocument(item.text, item.intent);
    });
    
    this.classifier.train();
  }

  async understand(input: string): Promise<Intent> {
    const normalizedInput = input.toLowerCase().trim();
    
    // Use vector database for semantic similarity if available
    let similarIntents: Array<{ text: string; score: number; metadata?: any }> = [];
    if (this.vectorDB) {
      try {
        const searchResults = await this.vectorDB.search(normalizedInput, { 
          limit: 3,
          filter: { type: 'intent_example' }
        });
        similarIntents = searchResults.map(r => ({
          text: r.text,
          score: r.score,
          metadata: r.metadata
        }));
      } catch (error) {
        console.warn('Vector search failed:', error);
      }
    }
    
    // First try pattern matching for high confidence
    for (const pattern of this.intentPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(normalizedInput)) {
          const entities = pattern.extractEntities ? 
            pattern.extractEntities(normalizedInput) : {};
          
          return {
            type: pattern.type,
            confidence: 0.9,
            entities,
            subIntents: this.extractSubIntents(normalizedInput, pattern.type),
            similarIntents
          };
        }
      }
    }
    
    // Fall back to classifier
    const classification = this.classifier.classify(normalizedInput);
    const classifications = this.classifier.getClassifications(normalizedInput);
    const topScore = classifications[0]?.value || 0;
    
    if (topScore > 0.5) {
      return {
        type: classification as Intent['type'],
        confidence: topScore,
        entities: this.extractGeneralEntities(normalizedInput),
        subIntents: this.extractSubIntents(normalizedInput, classification as Intent['type']),
        similarIntents
      };
    }
    
    // If no clear intent, try to understand based on context
    const contextIntent = await this.understandByContext(normalizedInput);
    return { ...contextIntent, similarIntents };
  }

  private extractSubIntents(text: string, mainIntent: Intent['type']): string[] {
    const subIntents: string[] = [];
    
    switch (mainIntent) {
      case 'create':
        if (/test|spec/i.test(text)) subIntents.push('with-tests');
        if (/typescript|ts/i.test(text)) subIntents.push('typescript');
        if (/style|css|styled/i.test(text)) subIntents.push('with-styling');
        if (/api|endpoint|route/i.test(text)) subIntents.push('api');
        if (/component|ui/i.test(text)) subIntents.push('ui-component');
        break;
        
      case 'fix':
        if (/type|typescript/i.test(text)) subIntents.push('type-error');
        if (/syntax/i.test(text)) subIntents.push('syntax-error');
        if (/logic|bug/i.test(text)) subIntents.push('logic-error');
        if (/style|css/i.test(text)) subIntents.push('styling-issue');
        break;
        
      case 'optimize':
        if (/bundle|size/i.test(text)) subIntents.push('bundle-size');
        if (/render|react/i.test(text)) subIntents.push('rendering');
        if (/database|query/i.test(text)) subIntents.push('database');
        if (/algorithm/i.test(text)) subIntents.push('algorithm');
        break;
    }
    
    // General sub-intents
    if (/quick|fast|simple/i.test(text)) subIntents.push('quick-solution');
    if (/best practice/i.test(text)) subIntents.push('best-practice');
    if (/example|demo/i.test(text)) subIntents.push('with-example');
    
    return subIntents;
  }

  private extractGeneralEntities(text: string): Record<string, string> {
    const entities: Record<string, string> = {};
    
    // Extract file paths
    const fileMatch = text.match(/(?:file|path|in)\s+['""]?([\/\w\-\.]+)['""]?/i);
    if (fileMatch) {
      entities.file = fileMatch[1];
    }
    
    // Extract programming languages
    const languages = ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'cpp', 'c'];
    for (const lang of languages) {
      if (new RegExp(`\\b${lang}\\b`, 'i').test(text)) {
        entities.language = lang;
        break;
      }
    }
    
    // Extract frameworks
    const frameworks = ['react', 'vue', 'angular', 'express', 'django', 'flask', 'spring'];
    for (const fw of frameworks) {
      if (new RegExp(`\\b${fw}\\b`, 'i').test(text)) {
        entities.framework = fw;
        break;
      }
    }
    
    return entities;
  }

  private async understandByContext(text: string): Promise<Intent> {
    // Context-based understanding
    const tokens = this.tokenizer.tokenize(text);
    
    // Look for action words
    const actionWords = {
      create: ['new', 'add', 'make', 'build', 'создать', 'новый'],
      fix: ['error', 'bug', 'issue', 'problem', 'ошибка'],
      optimize: ['slow', 'fast', 'better', 'improve', 'медленно'],
      search: ['where', 'find', 'show', 'list', 'где', 'найти']
    };
    
    let bestMatch: Intent['type'] = 'unknown';
    let maxScore = 0;
    
    for (const [intent, words] of Object.entries(actionWords)) {
      const score = tokens.filter(token => 
        words.some(word => token.toLowerCase().includes(word))
      ).length;
      
      if (score > maxScore) {
        maxScore = score;
        bestMatch = intent as Intent['type'];
      }
    }
    
    return {
      type: bestMatch,
      confidence: maxScore > 0 ? 0.5 + (maxScore * 0.1) : 0.3,
      entities: this.extractGeneralEntities(text),
      subIntents: []
    };
  }

  // Fuzzy intent matching for vague requests
  interpretVagueRequest(text: string): { possibleIntents: Intent[], suggestions: string[] } {
    const possibleIntents: Intent[] = [];
    const suggestions: string[] = [];
    
    // Common vague requests and their interpretations
    const vaguePatterns = [
      {
        pattern: /сделай\s*красиво|make\s*it\s*pretty|beautify/i,
        intents: ['optimize', 'refactor'],
        suggestions: [
          'Apply code formatting',
          'Add proper styling',
          'Improve code structure',
          'Add visual enhancements'
        ]
      },
      {
        pattern: /сделай\s*лучше|make\s*it\s*better|improve/i,
        intents: ['optimize', 'refactor', 'fix'],
        suggestions: [
          'Optimize performance',
          'Improve code quality',
          'Fix potential issues',
          'Enhance user experience'
        ]
      },
      {
        pattern: /исправь|fix\s*it|repair/i,
        intents: ['fix', 'analyze'],
        suggestions: [
          'Run diagnostics',
          'Fix syntax errors',
          'Resolve type issues',
          'Debug the application'
        ]
      },
      {
        pattern: /помоги|help\s*me|assist/i,
        intents: ['explain', 'analyze'],
        suggestions: [
          'Explain the current code',
          'Analyze potential issues',
          'Suggest improvements',
          'Guide through implementation'
        ]
      }
    ];
    
    for (const vaguePattern of vaguePatterns) {
      if (vaguePattern.pattern.test(text)) {
        for (const intentType of vaguePattern.intents) {
          possibleIntents.push({
            type: intentType as Intent['type'],
            confidence: 0.6,
            entities: {},
            subIntents: []
          });
        }
        suggestions.push(...vaguePattern.suggestions);
      }
    }
    
    // If no pattern matches, use general interpretation
    if (possibleIntents.length === 0) {
      possibleIntents.push({
        type: 'analyze',
        confidence: 0.4,
        entities: {},
        subIntents: []
      });
      
      suggestions.push(
        'Would you like me to analyze the current context?',
        'Should I suggest possible actions?',
        'Can you provide more specific details?'
      );
    }
    
    return { possibleIntents, suggestions };
  }

  // Intent chaining - predict next likely intent
  predictNextIntent(currentIntent: Intent): Intent[] {
    const nextIntents: Intent[] = [];
    
    const intentFlow: Partial<Record<Intent['type'], string[]>> = {
      create: ['test', 'explain', 'deploy'],
      fix: ['test', 'optimize', 'explain'],
      optimize: ['test', 'analyze', 'deploy'],
      test: ['fix', 'deploy', 'analyze'],
      refactor: ['test', 'optimize', 'explain'],
      deploy: ['test', 'analyze', 'fix']
    };
    
    const nextTypes = intentFlow[currentIntent.type] || ['analyze'];
    
    for (const nextType of nextTypes) {
      nextIntents.push({
        type: nextType as Intent['type'],
        confidence: 0.7,
        entities: currentIntent.entities,
        subIntents: []
      });
    }
    
    return nextIntents;
  }

  // Get intent explanation
  explainIntent(intent: Intent): string {
    const explanations: Record<Intent['type'], string> = {
      create: 'Creating or building new code, components, or features',
      fix: 'Fixing bugs, errors, or issues in existing code',
      optimize: 'Improving performance, efficiency, or code quality',
      search: 'Finding or locating files, code, or information',
      explain: 'Providing explanations or documentation',
      refactor: 'Restructuring code without changing functionality',
      test: 'Creating or running tests to verify code',
      deploy: 'Deploying or publishing code to production',
      analyze: 'Analyzing code structure, quality, or performance',
      unknown: 'Intent unclear, need more specific information'
    };
    
    let explanation = explanations[intent.type];
    
    if (intent.entities && Object.keys(intent.entities).length > 0) {
      explanation += '\nDetected entities: ' + 
        Object.entries(intent.entities)
          .map(([key, value]) => `${key}="${value}"`)
          .join(', ');
    }
    
    if (intent.subIntents.length > 0) {
      explanation += '\nSub-intents: ' + intent.subIntents.join(', ');
    }
    
    return explanation;
  }
}