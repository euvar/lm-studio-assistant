import { EventEmitter } from 'events';
import { VectorDatabase } from './vector-database.js';
import { EnhancedIntentUnderstanding } from './enhanced-intent-understanding.js';
import { HistoryManager } from './history.js';
import * as crypto from 'crypto';

export interface Suggestion {
  text: string;
  confidence: number;
  type: 'command' | 'completion' | 'action' | 'question' | 'fix';
  context?: {
    basedOn?: string;
    relatedFiles?: string[];
    recentActions?: string[];
  };
  icon?: string;
}

interface PatternMatch {
  pattern: string;
  frequency: number;
  lastUsed: number;
  context: Record<string, any>;
}

interface UserBehaviorModel {
  commonSequences: Array<{
    sequence: string[];
    frequency: number;
    avgTimeGap: number;
  }>;
  timePatterns: Array<{
    timeOfDay: string;
    commonActions: string[];
  }>;
  projectPatterns: Map<string, string[]>;
  errorPatterns: Map<string, string[]>;
}

export class PredictiveSuggestions extends EventEmitter {
  private vectorDB: VectorDatabase | null = null;
  private intentUnderstanding: EnhancedIntentUnderstanding;
  private historyManager: HistoryManager;
  private patternCache: Map<string, PatternMatch> = new Map();
  private userModel: UserBehaviorModel = {
    commonSequences: [],
    timePatterns: [],
    projectPatterns: new Map(),
    errorPatterns: new Map()
  };
  private contextualFactors: {
    currentDirectory: string;
    recentFiles: string[];
    recentErrors: string[];
    activeLanguages: string[];
    timeOfDay: string;
  } = {
    currentDirectory: process.cwd(),
    recentFiles: [],
    recentErrors: [],
    activeLanguages: [],
    timeOfDay: this.getTimeOfDay()
  };

  constructor() {
    super();
    this.intentUnderstanding = new EnhancedIntentUnderstanding();
    this.historyManager = new HistoryManager();
    this.initialize();
  }

  private async initialize() {
    try {
      await this.historyManager.initialize();
      this.vectorDB = new VectorDatabase({
        collectionName: 'predictive_suggestions',
        useLocalEmbeddings: true
      });
      await this.vectorDB.initialize();
      await this.loadUserModel();
      await this.analyzeHistoricalPatterns();
    } catch (error) {
      console.warn('Failed to initialize predictive suggestions:', error);
    }
  }

  async getSuggestions(currentInput: string, context?: any): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // 1. Get intent-based suggestions
    const intent = await this.intentUnderstanding.understand(currentInput);
    const intentSuggestions = await this.getIntentBasedSuggestions(intent, currentInput);
    suggestions.push(...intentSuggestions);
    
    // 2. Get pattern-based suggestions
    const patternSuggestions = await this.getPatternBasedSuggestions(currentInput);
    suggestions.push(...patternSuggestions);
    
    // 3. Get context-aware suggestions
    const contextSuggestions = await this.getContextAwareSuggestions(currentInput, context);
    suggestions.push(...contextSuggestions);
    
    // 4. Get completion suggestions
    const completions = await this.getCompletionSuggestions(currentInput);
    suggestions.push(...completions);
    
    // 5. Get time-based suggestions
    const timeSuggestions = this.getTimeBasedSuggestions();
    suggestions.push(...timeSuggestions);
    
    // Deduplicate and sort by confidence
    const uniqueSuggestions = this.deduplicateAndRank(suggestions);
    
    // Limit to top suggestions
    return uniqueSuggestions.slice(0, 5);
  }

  private async getIntentBasedSuggestions(intent: any, input: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // Predict next actions based on intent
    const nextActions = await this.intentUnderstanding.predictNextActions(intent);
    
    for (const action of nextActions) {
      suggestions.push({
        text: action,
        confidence: 0.8,
        type: 'action',
        icon: this.getIconForIntent(intent.type),
        context: {
          basedOn: 'intent analysis'
        }
      });
    }
    
    // Add suggested actions from intent
    if (intent.suggestedActions) {
      for (const suggested of intent.suggestedActions) {
        suggestions.push({
          text: suggested,
          confidence: 0.75,
          type: 'question',
          icon: '❓',
          context: {
            basedOn: 'intent suggestions'
          }
        });
      }
    }
    
    return suggestions;
  }

  private async getPatternBasedSuggestions(input: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // Check recent history for patterns
    const recentHistory = await this.historyManager.getRecentHistory(10);
    
    // Find common follow-up actions
    for (let i = 0; i < recentHistory.length - 1; i++) {
      const current = recentHistory[i].message;
      const next = recentHistory[i + 1].message;
      
      if (this.similarityScore(input, current) > 0.7) {
        suggestions.push({
          text: next,
          confidence: 0.7,
          type: 'command',
          icon: '🔄',
          context: {
            basedOn: 'history pattern'
          }
        });
      }
    }
    
    // Check learned patterns
    for (const [pattern, match] of this.patternCache) {
      if (input.includes(pattern)) {
        suggestions.push({
          text: this.generateSuggestionFromPattern(match),
          confidence: match.frequency / 10,
          type: 'command',
          icon: '📊',
          context: {
            basedOn: 'learned pattern'
          }
        });
      }
    }
    
    return suggestions;
  }

  private async getContextAwareSuggestions(input: string, context?: any): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // File-based suggestions
    if (this.contextualFactors.recentFiles.length > 0) {
      const lastFile = this.contextualFactors.recentFiles[0];
      const ext = lastFile.split('.').pop();
      
      if (ext === 'js' || ext === 'ts') {
        suggestions.push({
          text: `Run tests for ${lastFile}`,
          confidence: 0.6,
          type: 'command',
          icon: '🧪',
          context: {
            basedOn: 'recent file activity',
            relatedFiles: [lastFile]
          }
        });
      }
    }
    
    // Error-based suggestions
    if (this.contextualFactors.recentErrors.length > 0) {
      const lastError = this.contextualFactors.recentErrors[0];
      suggestions.push({
        text: `Fix the error: ${lastError.substring(0, 50)}...`,
        confidence: 0.8,
        type: 'fix',
        icon: '🔧',
        context: {
          basedOn: 'recent error'
        }
      });
    }
    
    // Project-specific suggestions
    const projectType = await this.detectProjectType();
    const projectSuggestions = this.getProjectSpecificSuggestions(projectType, input);
    suggestions.push(...projectSuggestions);
    
    return suggestions;
  }

  private async getCompletionSuggestions(input: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // Common command completions
    const commandCompletions = [
      { prefix: 'git ', completions: ['status', 'commit -m ""', 'push', 'pull', 'checkout -b'] },
      { prefix: 'npm ', completions: ['install', 'run dev', 'test', 'start', 'run build'] },
      { prefix: 'create ', completions: ['a new component', 'a REST API', 'unit tests', 'a new file'] },
      { prefix: 'fix ', completions: ['the error', 'type errors', 'the build', 'syntax errors'] },
      { prefix: 'show ', completions: ['me the code', 'recent changes', 'file structure', 'errors'] }
    ];
    
    for (const { prefix, completions } of commandCompletions) {
      if (input.toLowerCase().startsWith(prefix)) {
        const remaining = input.substring(prefix.length);
        for (const completion of completions) {
          if (completion.startsWith(remaining)) {
            suggestions.push({
              text: prefix + completion,
              confidence: 0.9 - (remaining.length * 0.1),
              type: 'completion',
              icon: '💡',
              context: {
                basedOn: 'command completion'
              }
            });
          }
        }
      }
    }
    
    // Smart completions from vector search
    if (this.vectorDB && input.length > 3) {
      const similar = await this.vectorDB.search(input, { limit: 3 });
      for (const result of similar) {
        if (result.score > 0.8) {
          suggestions.push({
            text: result.text,
            confidence: result.score,
            type: 'completion',
            icon: '🔍',
            context: {
              basedOn: 'similarity search'
            }
          });
        }
      }
    }
    
    return suggestions;
  }

  private getTimeBasedSuggestions(): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const currentTime = this.getTimeOfDay();
    
    // Find patterns for current time
    const timePattern = this.userModel.timePatterns.find(
      tp => tp.timeOfDay === currentTime
    );
    
    if (timePattern) {
      for (const action of timePattern.commonActions.slice(0, 2)) {
        suggestions.push({
          text: action,
          confidence: 0.5,
          type: 'command',
          icon: '⏰',
          context: {
            basedOn: `common ${currentTime} activity`
          }
        });
      }
    }
    
    // General time-based suggestions
    const timeSuggestionMap: Record<string, string[]> = {
      morning: ['Check project status', 'Review yesterday\'s changes', 'Plan today\'s tasks'],
      afternoon: ['Run tests', 'Commit changes', 'Review code'],
      evening: ['Build project', 'Update documentation', 'Push changes'],
      night: ['Fix remaining issues', 'Clean up code', 'Prepare for tomorrow']
    };
    
    const generalSuggestions = timeSuggestionMap[currentTime] || [];
    for (const suggestion of generalSuggestions.slice(0, 1)) {
      suggestions.push({
        text: suggestion,
        confidence: 0.4,
        type: 'action',
        icon: '📅',
        context: {
          basedOn: 'time of day'
        }
      });
    }
    
    return suggestions;
  }

  private async analyzeHistoricalPatterns() {
    const history = await this.historyManager.getFullHistory();
    
    // Analyze command sequences
    const sequences: Map<string, number> = new Map();
    for (let i = 0; i < history.length - 2; i++) {
      const sequence = [
        history[i].message,
        history[i + 1].message,
        history[i + 2].message
      ].join(' -> ');
      
      sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
    }
    
    // Store common sequences
    this.userModel.commonSequences = Array.from(sequences.entries())
      .filter(([, freq]) => freq > 2)
      .map(([seq, freq]) => ({
        sequence: seq.split(' -> '),
        frequency: freq,
        avgTimeGap: 0 // Could calculate actual time gaps
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
    
    // Analyze time patterns
    const timeActions: Map<string, string[]> = new Map();
    for (const entry of history) {
      const time = new Date(entry.timestamp).getHours();
      const timeOfDay = this.getTimeOfDayFromHour(time);
      
      if (!timeActions.has(timeOfDay)) {
        timeActions.set(timeOfDay, []);
      }
      timeActions.get(timeOfDay)!.push(entry.message);
    }
    
    // Store time patterns
    this.userModel.timePatterns = Array.from(timeActions.entries()).map(([time, actions]) => ({
      timeOfDay: time,
      commonActions: this.getMostCommon(actions, 5)
    }));
    
    // Index patterns in vector DB
    if (this.vectorDB) {
      for (const sequence of this.userModel.commonSequences) {
        await this.vectorDB.addDocument({
          id: crypto.createHash('md5').update(sequence.sequence.join('')).digest('hex'),
          text: sequence.sequence.join(' '),
          metadata: {
            type: 'intent_example' as const,
            timestamp: Date.now(),
            tags: ['pattern', `freq:${sequence.frequency}`]
          }
        });
      }
    }
  }

  private getProjectSpecificSuggestions(projectType: string, input: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    const projectSuggestions: Record<string, Array<{text: string, keywords: string[]}>> = {
      react: [
        { text: 'Create a new component', keywords: ['create', 'component', 'new'] },
        { text: 'Run npm start', keywords: ['run', 'start', 'launch'] },
        { text: 'Run tests', keywords: ['test', 'check'] }
      ],
      node: [
        { text: 'Start the server', keywords: ['start', 'run', 'server'] },
        { text: 'Check API endpoints', keywords: ['api', 'endpoint', 'route'] },
        { text: 'Run database migrations', keywords: ['database', 'migrate'] }
      ],
      python: [
        { text: 'Run python script', keywords: ['run', 'execute', 'python'] },
        { text: 'Install requirements', keywords: ['install', 'requirements', 'pip'] },
        { text: 'Run pytest', keywords: ['test', 'pytest'] }
      ]
    };
    
    const projectSuggest = projectSuggestions[projectType] || [];
    
    for (const { text, keywords } of projectSuggest) {
      const relevance = keywords.filter(kw => 
        input.toLowerCase().includes(kw)
      ).length / keywords.length;
      
      if (relevance > 0) {
        suggestions.push({
          text,
          confidence: 0.6 + (relevance * 0.2),
          type: 'command',
          icon: '🚀',
          context: {
            basedOn: `${projectType} project context`
          }
        });
      }
    }
    
    return suggestions;
  }

  private async detectProjectType(): Promise<string> {
    // Simple project type detection based on files
    const fs = await import('fs/promises');
    const files = await fs.readdir('.').catch(() => [] as string[]);
    
    if (files.includes('package.json')) {
      try {
        const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) return 'react';
        if (pkg.dependencies?.express) return 'node';
      } catch {}
      return 'node';
    }
    
    if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
      return 'python';
    }
    
    if (files.includes('Cargo.toml')) return 'rust';
    if (files.includes('go.mod')) return 'go';
    
    return 'general';
  }

  updateContext(update: Partial<typeof this.contextualFactors>) {
    this.contextualFactors = { ...this.contextualFactors, ...update };
    this.emit('contextUpdated', this.contextualFactors);
  }

  async learnFromInteraction(input: string, chosenSuggestion?: Suggestion, wasSuccessful: boolean = true) {
    // Update pattern cache
    const pattern = this.extractPattern(input);
    const existing = this.patternCache.get(pattern) || {
      pattern,
      frequency: 0,
      lastUsed: Date.now(),
      context: {}
    };
    
    existing.frequency += wasSuccessful ? 1 : -0.5;
    existing.lastUsed = Date.now();
    this.patternCache.set(pattern, existing);
    
    // Store in vector DB for future similarity searches
    if (this.vectorDB && wasSuccessful) {
      await this.vectorDB.addDocument({
        id: crypto.createHash('md5').update(`${input}_${Date.now()}`).digest('hex'),
        text: input,
        metadata: {
          type: 'intent_example' as const,
          timestamp: Date.now(),
          tags: [wasSuccessful ? 'successful' : 'failed', 'learned']
        }
      });
    }
    
    this.emit('learned', { input, pattern, wasSuccessful });
  }

  private deduplicateAndRank(suggestions: Suggestion[]): Suggestion[] {
    const seen = new Map<string, Suggestion>();
    
    for (const suggestion of suggestions) {
      const key = suggestion.text.toLowerCase();
      const existing = seen.get(key);
      
      if (!existing || suggestion.confidence > existing.confidence) {
        seen.set(key, suggestion);
      }
    }
    
    return Array.from(seen.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  private similarityScore(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    
    // Simple similarity based on common words
    const aWords = new Set(aLower.split(/\s+/));
    const bWords = new Set(bLower.split(/\s+/));
    
    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    
    return intersection.size / union.size;
  }

  private extractPattern(input: string): string {
    // Extract general pattern from input
    return input
      .toLowerCase()
      .replace(/["'].+?["']/g, '""') // Replace quoted strings
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/\s+/g, ' ')
      .trim();
  }

  private generateSuggestionFromPattern(match: PatternMatch): string {
    // Generate a suggestion based on a learned pattern
    return match.pattern
      .replace(/\bN\b/g, '1') // Replace number placeholders
      .replace('""', '"example"'); // Replace string placeholders
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    return this.getTimeOfDayFromHour(hour);
  }

  private getTimeOfDayFromHour(hour: number): string {
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private getMostCommon<T>(items: T[], limit: number): T[] {
    const counts = new Map<T, number>();
    
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  }

  private getIconForIntent(type: string): string {
    const iconMap: Record<string, string> = {
      create: '✨',
      fix: '🔧',
      optimize: '⚡',
      search: '🔍',
      explain: '📚',
      refactor: '♻️',
      test: '🧪',
      deploy: '🚀',
      analyze: '📊',
      help: '💡',
      unknown: '❓'
    };
    
    return iconMap[type] || '📝';
  }

  private async loadUserModel() {
    // In a real implementation, this would load from persistent storage
    // For now, we'll start with an empty model
    this.emit('modelLoaded', this.userModel);
  }

  async saveUserModel() {
    // In a real implementation, this would save to persistent storage
    this.emit('modelSaved', this.userModel);
  }
}