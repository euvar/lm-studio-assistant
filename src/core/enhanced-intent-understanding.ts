import { EventEmitter } from 'events';
import natural from 'natural';
import { VectorDatabase } from './vector-database.js';
import * as crypto from 'crypto';

interface Intent {
  type: 'create' | 'fix' | 'optimize' | 'search' | 'explain' | 'refactor' | 'test' | 'deploy' | 'analyze' | 'help' | 'unknown';
  confidence: number;
  entities: Record<string, string>;
  subIntents: string[];
  context?: {
    language?: string;
    domain?: string;
    previousIntents?: Intent[];
    userPreferences?: Record<string, any>;
    reference?: string;
    source?: string;
    userLanguage?: string;
    [key: string]: any;
  };
  similarIntents?: Array<{ text: string; score: number; metadata?: any }>;
  suggestedActions?: string[];
}

interface ConversationContext {
  history: Array<{
    input: string;
    intent: Intent;
    timestamp: number;
    feedback?: 'positive' | 'negative';
  }>;
  currentDomain?: string;
  userLanguage?: string;
  activeProject?: string;
}

interface LearnedPattern {
  pattern: string;
  intent: Intent['type'];
  successRate: number;
  usageCount: number;
}

export class EnhancedIntentUnderstanding extends EventEmitter {
  private tokenizer = new natural.WordTokenizer();
  private stemmer = natural.PorterStemmer;
  private sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
  private tfidf = new natural.TfIdf();
  private classifier = new natural.BayesClassifier();
  private vectorDB: VectorDatabase | null = null;
  private conversationContext: ConversationContext = { history: [] };
  private learnedPatterns: Map<string, LearnedPattern> = new Map();
  
  // Multilingual intent patterns
  private multilingualPatterns = {
    create: {
      en: ['create', 'build', 'make', 'generate', 'implement', 'add', 'write', 'develop'],
      ru: ['создать', 'сделать', 'написать', 'добавить', 'разработать', 'реализовать'],
      es: ['crear', 'construir', 'hacer', 'generar', 'implementar', 'añadir', 'escribir'],
      zh: ['创建', '建立', '制作', '生成', '实现', '添加', '编写']
    },
    fix: {
      en: ['fix', 'repair', 'solve', 'debug', 'resolve', 'correct', 'patch'],
      ru: ['исправить', 'починить', 'решить', 'отладить', 'устранить'],
      es: ['arreglar', 'reparar', 'resolver', 'depurar', 'corregir'],
      zh: ['修复', '修理', '解决', '调试', '纠正']
    },
    optimize: {
      en: ['optimize', 'improve', 'enhance', 'speed up', 'performance', 'faster'],
      ru: ['оптимизировать', 'улучшить', 'ускорить', 'быстрее', 'производительность'],
      es: ['optimizar', 'mejorar', 'acelerar', 'rendimiento'],
      zh: ['优化', '改进', '加速', '性能']
    }
  };

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    await this.initializeVectorDB();
    this.trainEnhancedClassifier();
    await this.loadLearnedPatterns();
  }

  private async initializeVectorDB() {
    try {
      this.vectorDB = new VectorDatabase({
        collectionName: 'enhanced_intent_understanding',
        useLocalEmbeddings: true
      });
      await this.vectorDB.initialize();
      await this.indexEnhancedTrainingData();
    } catch (error) {
      console.warn('Failed to initialize vector DB:', error);
    }
  }

  private async indexEnhancedTrainingData() {
    if (!this.vectorDB) return;

    // Extended training data with context
    const contextualExamples = [
      // Development context
      { text: 'set up a new project with typescript and jest', type: 'create', context: { domain: 'development', technologies: ['typescript', 'jest'] }},
      { text: 'initialize a react app with routing and state management', type: 'create', context: { domain: 'frontend', technologies: ['react', 'routing'] }},
      
      // Debugging context
      { text: 'the app crashes when clicking the submit button', type: 'fix', context: { domain: 'debugging', severity: 'high' }},
      { text: 'memory leak in the background service', type: 'fix', context: { domain: 'performance', severity: 'critical' }},
      
      // Optimization context
      { text: 'reduce the bundle size of my application', type: 'optimize', context: { domain: 'performance', aspect: 'bundle' }},
      { text: 'make the database queries run faster', type: 'optimize', context: { domain: 'backend', aspect: 'database' }},
      
      // Learning context
      { text: 'how does async/await work in javascript', type: 'explain', context: { domain: 'learning', language: 'javascript' }},
      { text: 'explain the difference between let and const', type: 'explain', context: { domain: 'learning', language: 'javascript' }},
      
      // Multilingual examples
      { text: 'создай новый компонент React', type: 'create', context: { language: 'ru', domain: 'frontend' }},
      { text: 'исправь ошибку типа в TypeScript', type: 'fix', context: { language: 'ru', domain: 'typescript' }},
      
      // Contextual phrases
      { text: 'like we did yesterday but with hooks', type: 'create', context: { reference: 'previous', modifier: 'with-hooks' }},
      { text: 'same thing but for the user service', type: 'unknown', context: { reference: 'previous', target: 'user-service' }}
    ];

    for (const example of contextualExamples) {
      await this.vectorDB.addDocument({
        id: crypto.createHash('md5').update(`intent_${Date.now()}_${example.text}`).digest('hex'),
        text: example.text,
        metadata: {
          type: 'intent_example',
          intentType: example.type,
          timestamp: Date.now(),
          tags: [example.type, 'intent', 'contextual']
        }
      });
    }
  }

  private trainEnhancedClassifier() {
    // Train with more diverse examples
    const enhancedTrainingData = [
      // Conversational variations
      { text: 'could you help me create a new component', intent: 'create' },
      { text: 'I need to build an API endpoint', intent: 'create' },
      { text: 'lets make a new feature', intent: 'create' },
      
      // Problem descriptions
      { text: 'something is wrong with the login', intent: 'fix' },
      { text: 'users are complaining about slow loading', intent: 'optimize' },
      { text: 'the app is using too much memory', intent: 'optimize' },
      
      // Indirect requests
      { text: 'this code is messy', intent: 'refactor' },
      { text: 'I dont understand how this works', intent: 'explain' },
      { text: 'we need to ship this to production', intent: 'deploy' },
      
      // Help requests
      { text: 'I am stuck', intent: 'help' },
      { text: 'not sure what to do next', intent: 'help' },
      { text: 'can you assist me', intent: 'help' }
    ];

    enhancedTrainingData.forEach(item => {
      this.classifier.addDocument(item.text, item.intent);
    });

    this.classifier.train();
  }

  async understand(input: string, context?: Partial<ConversationContext>): Promise<Intent> {
    const normalizedInput = input.toLowerCase().trim();
    
    // Detect language
    const detectedLanguage = this.detectLanguage(normalizedInput);
    
    // Get conversation context
    const fullContext = { ...this.conversationContext, ...context };
    
    // Check for contextual references
    const contextualIntent = await this.checkContextualReferences(normalizedInput, fullContext);
    if (contextualIntent && contextualIntent.confidence > 0.7) {
      return contextualIntent;
    }
    
    // Use vector similarity search
    let similarIntents = await this.findSimilarIntents(normalizedInput);
    
    // Pattern matching with multilingual support
    const patternIntent = this.matchMultilingualPatterns(normalizedInput, detectedLanguage);
    if (patternIntent && patternIntent.confidence > 0.8) {
      patternIntent.similarIntents = similarIntents;
      return this.enrichIntent(patternIntent, fullContext);
    }
    
    // Classifier-based understanding
    const classifierIntent = await this.classifyIntent(normalizedInput);
    
    // Check learned patterns
    const learnedIntent = this.checkLearnedPatterns(normalizedInput);
    
    // Combine all methods for final intent
    const finalIntent = this.combineIntentResults(
      patternIntent,
      classifierIntent,
      learnedIntent,
      similarIntents
    );
    
    // Add context and suggestions
    const enrichedIntent = this.enrichIntent(finalIntent, fullContext);
    
    // Update conversation history
    this.updateConversationHistory(input, enrichedIntent);
    
    return enrichedIntent;
  }

  private detectLanguage(text: string): string {
    // Simple language detection based on character sets and common words
    if (/[а-яА-Я]/.test(text)) return 'ru';
    if (/[一-龯]/.test(text)) return 'zh';
    if (/[ñáéíóú]/i.test(text)) return 'es';
    return 'en';
  }

  private async checkContextualReferences(input: string, context: ConversationContext): Promise<Intent | null> {
    // Check for references to previous actions
    if (/same|similar|like before|again|también|тоже|一样/i.test(input) && context.history.length > 0) {
      const previousIntent = context.history[context.history.length - 1].intent;
      return {
        ...previousIntent,
        confidence: 0.8,
        entities: this.extractGeneralEntities(input),
        context: {
          reference: 'previous',
          previousIntents: [previousIntent]
        }
      };
    }
    
    // Check for modifications to previous intents
    if (/but|except|instead|however|но|除了|pero/i.test(input) && context.history.length > 0) {
      const previousIntent = context.history[context.history.length - 1].intent;
      const modifications = this.extractModifications(input);
      
      return {
        type: previousIntent.type,
        confidence: 0.75,
        entities: { ...previousIntent.entities, ...modifications },
        subIntents: [...previousIntent.subIntents, 'modified'],
        context: {
          reference: 'modified',
          previousIntents: [previousIntent]
        }
      };
    }
    
    return null;
  }

  private matchMultilingualPatterns(text: string, language: string): Intent | null {
    for (const [intentType, translations] of Object.entries(this.multilingualPatterns)) {
      const patterns = translations[language as keyof typeof translations] || translations.en;
      
      for (const pattern of patterns) {
        if (new RegExp(`\\b${pattern}\\b`, 'i').test(text)) {
          return {
            type: intentType as Intent['type'],
            confidence: 0.85,
            entities: this.extractGeneralEntities(text),
            subIntents: this.extractSubIntents(text, intentType as Intent['type']),
            context: { language }
          };
        }
      }
    }
    
    return null;
  }

  private async findSimilarIntents(input: string): Promise<Array<{ text: string; score: number; metadata?: any }>> {
    if (!this.vectorDB) return [];
    
    try {
      const results = await this.vectorDB.search(input, {
        limit: 5,
        filter: { type: 'contextual_intent' }
      });
      
      return results.map(r => ({
        text: r.text,
        score: r.score,
        metadata: r.metadata
      }));
    } catch (error) {
      console.warn('Vector search failed:', error);
      return [];
    }
  }

  private async classifyIntent(input: string): Promise<Intent> {
    const classification = this.classifier.classify(input);
    const classifications = this.classifier.getClassifications(input);
    const topScore = classifications[0]?.value || 0;
    
    // Analyze sentiment to adjust confidence
    const tokens = this.tokenizer.tokenize(input) || [];
    const sentimentScore = this.sentiment.getSentiment(tokens);
    
    // Negative sentiment might indicate a problem (fix intent)
    let adjustedType = classification as Intent['type'];
    let adjustedConfidence = topScore;
    
    if (sentimentScore < -0.5 && classification !== 'fix') {
      adjustedType = 'fix';
      adjustedConfidence *= 0.8;
    }
    
    return {
      type: adjustedType,
      confidence: adjustedConfidence,
      entities: this.extractGeneralEntities(input),
      subIntents: this.extractSubIntents(input, adjustedType)
    };
  }

  private checkLearnedPatterns(input: string): Intent | null {
    const stemmedInput = this.stemmer.tokenizeAndStem(input).join(' ');
    
    for (const [pattern, learned] of this.learnedPatterns) {
      if (stemmedInput.includes(pattern) && learned.successRate > 0.7) {
        return {
          type: learned.intent,
          confidence: 0.7 * learned.successRate,
          entities: this.extractGeneralEntities(input),
          subIntents: [],
          context: { source: 'learned' }
        };
      }
    }
    
    return null;
  }

  private combineIntentResults(
    pattern: Intent | null,
    classifier: Intent,
    learned: Intent | null,
    similar: Array<{ text: string; score: number; metadata?: any }>
  ): Intent {
    // Weight different methods
    const weights = {
      pattern: 0.4,
      classifier: 0.3,
      learned: 0.2,
      similar: 0.1
    };
    
    // Calculate weighted confidence
    let totalConfidence = 0;
    let selectedType: Intent['type'] = 'unknown';
    
    if (pattern) {
      totalConfidence += pattern.confidence * weights.pattern;
      selectedType = pattern.type;
    }
    
    if (classifier.confidence > 0.5) {
      totalConfidence += classifier.confidence * weights.classifier;
      if (!pattern) selectedType = classifier.type;
    }
    
    if (learned) {
      totalConfidence += learned.confidence * weights.learned;
      if (!pattern && learned.confidence > classifier.confidence) {
        selectedType = learned.type;
      }
    }
    
    if (similar.length > 0 && similar[0].score > 0.8) {
      totalConfidence += similar[0].score * weights.similar;
    }
    
    return {
      type: selectedType,
      confidence: Math.min(totalConfidence, 1),
      entities: { ...pattern?.entities, ...classifier.entities },
      subIntents: [...(pattern?.subIntents || []), ...(classifier.subIntents || [])],
      similarIntents: similar
    };
  }

  private enrichIntent(intent: Intent, context: ConversationContext): Intent {
    // Add contextual information
    intent.context = {
      ...intent.context,
      previousIntents: context.history.slice(-3).map(h => h.intent),
      userLanguage: context.userLanguage,
      domain: this.inferDomain(intent, context)
    };
    
    // Add suggested actions based on intent type
    intent.suggestedActions = this.generateSuggestedActions(intent, context);
    
    // Boost confidence if intent aligns with recent context
    if (context.history.length > 0) {
      const recentIntents = context.history.slice(-3).map(h => h.intent.type);
      if (recentIntents.includes(intent.type)) {
        intent.confidence = Math.min(intent.confidence * 1.2, 1);
      }
    }
    
    return intent;
  }

  private inferDomain(intent: Intent, context: ConversationContext): string {
    // Infer domain from entities and context
    if (intent.entities.framework) {
      if (['react', 'vue', 'angular'].includes(intent.entities.framework)) return 'frontend';
      if (['express', 'django', 'flask'].includes(intent.entities.framework)) return 'backend';
    }
    
    if (intent.entities.language) {
      if (['html', 'css', 'javascript'].includes(intent.entities.language)) return 'frontend';
      if (['python', 'java', 'go'].includes(intent.entities.language)) return 'backend';
    }
    
    // Check subintents
    if (intent.subIntents.includes('api') || intent.subIntents.includes('database')) return 'backend';
    if (intent.subIntents.includes('ui-component') || intent.subIntents.includes('styling')) return 'frontend';
    
    return context.currentDomain || 'general';
  }

  private generateSuggestedActions(intent: Intent, context: ConversationContext): string[] {
    const suggestions: string[] = [];
    
    switch (intent.type) {
      case 'create':
        suggestions.push(
          'Would you like me to include tests?',
          'Should I follow any specific design pattern?',
          'Do you need documentation as well?'
        );
        break;
        
      case 'fix':
        suggestions.push(
          'Can you show me the error message?',
          'Would you like me to analyze the entire file?',
          'Should I check for related issues?'
        );
        break;
        
      case 'optimize':
        suggestions.push(
          'Would you like a performance analysis first?',
          'Should I focus on speed or memory usage?',
          'Do you have specific performance targets?'
        );
        break;
        
      case 'unknown':
        suggestions.push(
          'Could you provide more details?',
          'What would you like to accomplish?',
          'Can you describe the problem or goal?'
        );
        break;
    }
    
    return suggestions;
  }

  private extractModifications(text: string): Record<string, string> {
    const modifications: Record<string, string> = {};
    
    // Extract "but with/without" patterns
    const withMatch = text.match(/but\s+with(?:out)?\s+(\w+(?:\s+\w+)*)/i);
    if (withMatch) {
      modifications.modifier = withMatch[0].includes('without') ? 
        `exclude-${withMatch[1]}` : `include-${withMatch[1]}`;
    }
    
    // Extract "instead of" patterns
    const insteadMatch = text.match(/instead\s+of\s+(\w+(?:\s+\w+)*)/i);
    if (insteadMatch) {
      modifications.replacement = insteadMatch[1];
    }
    
    return modifications;
  }

  private extractSubIntents(text: string, mainIntent: Intent['type']): string[] {
    const subIntents: string[] = [];
    
    // Technology-specific subintents
    if (/typescript|ts|typed/i.test(text)) subIntents.push('typescript');
    if (/test|spec|jest|mocha/i.test(text)) subIntents.push('with-tests');
    if (/docker|container/i.test(text)) subIntents.push('containerized');
    if (/ci\/cd|pipeline|github\s+actions/i.test(text)) subIntents.push('with-cicd');
    
    // Quality indicators
    if (/clean|maintainable|scalable/i.test(text)) subIntents.push('high-quality');
    if (/quick|fast|simple|mvp/i.test(text)) subIntents.push('quick-solution');
    if (/production|enterprise/i.test(text)) subIntents.push('production-ready');
    
    // Specific to intent type
    if (mainIntent === 'create' && /full[\s-]?stack/i.test(text)) {
      subIntents.push('fullstack');
    }
    
    return [...new Set(subIntents)]; // Remove duplicates
  }

  private extractGeneralEntities(text: string): Record<string, string> {
    const entities: Record<string, string> = {};
    
    // File paths with better detection
    const fileMatch = text.match(/(?:file|path|in)\s+['""]?([\/\w\-\.]+\.\w{2,4})['""]?/i);
    if (fileMatch) {
      entities.file = fileMatch[1];
    }
    
    // Programming languages (expanded list)
    const languages = [
      'javascript', 'typescript', 'python', 'java', 'go', 'rust', 
      'cpp', 'c', 'csharp', 'php', 'ruby', 'swift', 'kotlin'
    ];
    for (const lang of languages) {
      if (new RegExp(`\\b${lang}\\b`, 'i').test(text)) {
        entities.language = lang;
        break;
      }
    }
    
    // Frameworks and libraries (expanded)
    const frameworks = [
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
      'express', 'fastapi', 'django', 'flask', 'spring', 'rails',
      'tensorflow', 'pytorch', 'pandas', 'numpy'
    ];
    for (const fw of frameworks) {
      if (new RegExp(`\\b${fw}\\b`, 'i').test(text)) {
        entities.framework = fw;
        break;
      }
    }
    
    // Version numbers
    const versionMatch = text.match(/v?(\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch) {
      entities.version = versionMatch[1];
    }
    
    return entities;
  }

  private updateConversationHistory(input: string, intent: Intent) {
    this.conversationContext.history.push({
      input,
      intent,
      timestamp: Date.now()
    });
    
    // Keep history size manageable
    if (this.conversationContext.history.length > 10) {
      this.conversationContext.history = this.conversationContext.history.slice(-10);
    }
    
    this.emit('intentProcessed', { input, intent });
  }

  async learnFromFeedback(input: string, intent: Intent, feedback: 'positive' | 'negative') {
    // Update history with feedback
    const lastEntry = this.conversationContext.history[this.conversationContext.history.length - 1];
    if (lastEntry && lastEntry.input === input) {
      lastEntry.feedback = feedback;
    }
    
    // Learn patterns from positive feedback
    if (feedback === 'positive') {
      const stemmedInput = this.stemmer.tokenizeAndStem(input).join(' ');
      const pattern = this.learnedPatterns.get(stemmedInput) || {
        pattern: stemmedInput,
        intent: intent.type,
        successRate: 0,
        usageCount: 0
      };
      
      pattern.usageCount++;
      pattern.successRate = (pattern.successRate * (pattern.usageCount - 1) + 1) / pattern.usageCount;
      
      this.learnedPatterns.set(stemmedInput, pattern);
      
      // Store in vector DB for future use
      if (this.vectorDB) {
        await this.vectorDB.addDocument({
          id: crypto.createHash('md5').update(`learned_${input}_${Date.now()}`).digest('hex'),
          text: input,
          metadata: {
            type: 'intent_example',
            intentType: intent.type,
            score: intent.confidence,
            timestamp: Date.now(),
            tags: ['learned', 'positive-feedback', intent.type]
          }
        });
      }
    }
    
    await this.saveLearnedPatterns();
  }

  async predictNextActions(currentIntent: Intent): Promise<string[]> {
    const predictions: string[] = [];
    
    // Analyze conversation flow patterns
    const flowPatterns: Record<string, string[]> = {
      create: ['test', 'document', 'deploy', 'optimize'],
      fix: ['test', 'verify', 'commit', 'deploy'],
      optimize: ['benchmark', 'test', 'document', 'deploy'],
      test: ['fix', 'refactor', 'document', 'deploy'],
      refactor: ['test', 'review', 'document', 'commit']
    };
    
    const nextActions = flowPatterns[currentIntent.type] || ['analyze', 'explain'];
    
    // Personalize based on history
    if (this.conversationContext.history.length > 3) {
      const recentPatterns = this.analyzeRecentPatterns();
      nextActions.push(...recentPatterns);
    }
    
    // Generate natural language predictions
    for (const action of nextActions) {
      predictions.push(`Would you like to ${action} the changes?`);
    }
    
    return predictions.slice(0, 3); // Return top 3 predictions
  }

  private analyzeRecentPatterns(): string[] {
    const patterns: string[] = [];
    const recentIntents = this.conversationContext.history
      .slice(-5)
      .map(h => h.intent.type);
    
    // Find common sequences
    const sequences: Record<string, number> = {};
    for (let i = 0; i < recentIntents.length - 1; i++) {
      const sequence = `${recentIntents[i]}-${recentIntents[i + 1]}`;
      sequences[sequence] = (sequences[sequence] || 0) + 1;
    }
    
    // Extract patterns from sequences
    Object.entries(sequences)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .forEach(([sequence]) => {
        const [, next] = sequence.split('-');
        patterns.push(next);
      });
    
    return patterns;
  }

  private async saveLearnedPatterns() {
    // In a real implementation, this would persist to a file or database
    // For now, it's kept in memory
    this.emit('patternsUpdated', {
      count: this.learnedPatterns.size,
      patterns: Array.from(this.learnedPatterns.values())
        .filter(p => p.successRate > 0.7)
        .slice(0, 10)
    });
  }

  private async loadLearnedPatterns() {
    // In a real implementation, this would load from persistent storage
    // For now, we'll initialize with some common patterns
    const commonPatterns = [
      { pattern: 'help debug', intent: 'fix' as Intent['type'], successRate: 0.9, usageCount: 10 },
      { pattern: 'make faster', intent: 'optimize' as Intent['type'], successRate: 0.85, usageCount: 8 },
      { pattern: 'add feature', intent: 'create' as Intent['type'], successRate: 0.9, usageCount: 15 }
    ];
    
    commonPatterns.forEach(p => {
      this.learnedPatterns.set(p.pattern, p);
    });
  }

  getConversationContext(): ConversationContext {
    return this.conversationContext;
  }

  setConversationContext(context: Partial<ConversationContext>) {
    this.conversationContext = { ...this.conversationContext, ...context };
  }

  clearConversationHistory() {
    this.conversationContext.history = [];
    this.emit('historyCleared');
  }
}