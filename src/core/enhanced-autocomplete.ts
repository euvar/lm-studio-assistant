import chalk from 'chalk';
import { PredictiveSuggestions, Suggestion as PredictiveSuggestion } from './predictive-suggestions.js';
import { AutoCompleter, Suggestion } from './autocomplete.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class EnhancedAutoCompleter extends AutoCompleter {
  private predictiveSuggestions: PredictiveSuggestions;
  private currentContext: any = {};
  private lastSuggestions: Suggestion[] = [];
  private userSelectionHistory: Map<string, number> = new Map();
  
  constructor() {
    super();
    this.predictiveSuggestions = new PredictiveSuggestions();
    this.initializeEnhancements();
  }

  private initializeEnhancements() {
    // Add more intelligent prompts
    this.addSmartPrompts();
    
    // Listen for context updates
    this.predictiveSuggestions.on('contextUpdated', (context) => {
      this.currentContext = context;
    });
  }

  private addSmartPrompts() {
    const smartPrompts: Suggestion[] = [
      { text: 'Fix the error in', description: 'Debug and fix errors', type: 'tool' },
      { text: 'Generate tests for', description: 'Create unit tests', type: 'tool' },
      { text: 'Refactor', description: 'Improve code structure', type: 'tool' },
      { text: 'Deploy to', description: 'Deploy your application', type: 'tool' },
      { text: 'Optimize', description: 'Improve performance', type: 'tool' },
      { text: 'Convert', description: 'Convert between formats', type: 'tool' },
      { text: 'Analyze', description: 'Analyze code or project', type: 'tool' },
      { text: 'Install', description: 'Install packages or dependencies', type: 'tool' }
    ];
    
    // Add to common prompts
    this.commonPrompts.push(...smartPrompts);
  }

  getSuggestions(input: string): Suggestion[] {
    // For synchronous compatibility, we'll use cached predictions
    return this.getSuggestionsSync(input);
  }
  
  private getSuggestionsSync(input: string): Suggestion[] {
    const lowerInput = input.toLowerCase().trim();
    
    // Get basic suggestions from parent class
    const basicSuggestions = super.getSuggestions(input);
    
    // For synchronous operation, we'll use simpler suggestions
    const contextual = this.getContextualSuggestionsSync(input);
    const fileCompletions: Suggestion[] = [];
    
    // Combine all suggestions
    const allSuggestions = [
      ...basicSuggestions,
      ...contextual,
      ...fileCompletions
    ];
    
    // Deduplicate and rank
    const ranked = this.rankSuggestions(allSuggestions, input);
    
    // Store for learning
    this.lastSuggestions = ranked.slice(0, 10);
    
    return ranked.slice(0, 7); // Show up to 7 suggestions
  }

  private async getPredictiveSuggestions(input: string): Promise<Suggestion[]> {
    try {
      const predictions = await this.predictiveSuggestions.getSuggestions(input, this.currentContext);
      
      return predictions.map(pred => ({
        text: pred.text,
        description: this.formatPredictiveDescription(pred),
        type: this.mapPredictiveType(pred.type)
      }));
    } catch (error) {
      console.warn('Error getting predictive suggestions:', error);
      return [];
    }
  }

  private formatPredictiveDescription(pred: PredictiveSuggestion): string {
    let desc = '';
    
    if (pred.context?.basedOn) {
      desc = `Based on ${pred.context.basedOn}`;
    }
    
    if (pred.confidence > 0.8) {
      desc = `⭐ ${desc || 'Highly recommended'}`;
    } else if (pred.confidence > 0.6) {
      desc = `✨ ${desc || 'Suggested'}`;
    }
    
    return desc;
  }

  private mapPredictiveType(type: string): 'command' | 'file' | 'tool' | 'history' {
    switch (type) {
      case 'command':
      case 'action':
        return 'command';
      case 'completion':
        return 'history';
      default:
        return 'tool';
    }
  }

  private async getSmartFileCompletions(input: string): Promise<Suggestion[]> {
    // Check if input looks like a file path
    if (!input.includes('/') && !input.includes('\\') && !input.includes('.')) {
      return [];
    }

    const suggestions: Suggestion[] = [];
    
    try {
      const parts = input.split(/[/\\]/);
      const dirPath = parts.slice(0, -1).join(path.sep) || '.';
      const partial = parts[parts.length - 1].toLowerCase();
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.toLowerCase().startsWith(partial)) {
          const fullPath = path.join(dirPath, entry.name);
          suggestions.push({
            text: fullPath,
            description: entry.isDirectory() ? '📁 Directory' : `📄 ${path.extname(entry.name) || 'File'}`,
            type: 'file'
          });
        }
      }
    } catch (error) {
      // Ignore errors for invalid paths
    }
    
    return suggestions.slice(0, 5);
  }

  private getContextualSuggestionsSync(input: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // Git-related suggestions
    if (input.toLowerCase().includes('git')) {
      suggestions.push(
        { text: 'git status', description: 'Check repository status', type: 'command' },
        { text: 'git commit -m ""', description: 'Commit changes', type: 'command' },
        { text: 'git push', description: 'Push to remote', type: 'command' }
      );
    }
    
    // Error handling suggestions
    if (input.toLowerCase().includes('error') || input.toLowerCase().includes('fix')) {
      suggestions.push({
        text: 'Fix the error',
        description: '🔧 Debug and fix',
        type: 'tool'
      });
    }
    
    // Language-specific suggestions
    const languageKeywords = {
      javascript: ['npm', 'node', 'console.log', 'const', 'require'],
      python: ['pip', 'python', 'import', 'def', 'print'],
      rust: ['cargo', 'rustc', 'fn', 'let', 'use'],
      go: ['go', 'package', 'func', 'import']
    };
    
    for (const [lang, keywords] of Object.entries(languageKeywords)) {
      if (keywords.some(kw => input.toLowerCase().includes(kw))) {
        suggestions.push(...this.getLanguageSuggestions(lang));
      }
    }
    
    return suggestions;
  }

  private async getContextualSuggestions(input: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // Git-related suggestions
    if (input.toLowerCase().includes('git')) {
      suggestions.push(
        { text: 'git status', description: 'Check repository status', type: 'command' },
        { text: 'git commit -m ""', description: 'Commit changes', type: 'command' },
        { text: 'git push', description: 'Push to remote', type: 'command' }
      );
    }
    
    // Error handling suggestions
    if (input.toLowerCase().includes('error') || input.toLowerCase().includes('fix')) {
      // Get recent errors from context
      const recentError = this.currentContext.recentErrors?.[0];
      if (recentError) {
        suggestions.push({
          text: `Fix error: ${recentError.substring(0, 30)}...`,
          description: '🔧 Recent error',
          type: 'tool'
        });
      }
    }
    
    // Language-specific suggestions
    const languageKeywords = {
      javascript: ['npm', 'node', 'console.log', 'const', 'require'],
      python: ['pip', 'python', 'import', 'def', 'print'],
      rust: ['cargo', 'rustc', 'fn', 'let', 'use'],
      go: ['go', 'package', 'func', 'import']
    };
    
    for (const [lang, keywords] of Object.entries(languageKeywords)) {
      if (keywords.some(kw => input.toLowerCase().includes(kw))) {
        suggestions.push(...this.getLanguageSuggestions(lang as any));
      }
    }
    
    return suggestions;
  }

  private getLanguageSuggestions(language: string): Suggestion[] {
    const languageSuggestions: Record<string, Suggestion[]> = {
      javascript: [
        { text: 'npm install', description: 'Install dependencies', type: 'command' },
        { text: 'npm test', description: 'Run tests', type: 'command' },
        { text: 'Create React component', description: 'Generate component', type: 'tool' }
      ],
      python: [
        { text: 'pip install -r requirements.txt', description: 'Install requirements', type: 'command' },
        { text: 'python -m pytest', description: 'Run tests', type: 'command' },
        { text: 'Create Flask app', description: 'Generate Flask application', type: 'tool' }
      ],
      rust: [
        { text: 'cargo build', description: 'Build project', type: 'command' },
        { text: 'cargo test', description: 'Run tests', type: 'command' },
        { text: 'cargo fmt', description: 'Format code', type: 'command' }
      ],
      go: [
        { text: 'go build', description: 'Build project', type: 'command' },
        { text: 'go test', description: 'Run tests', type: 'command' },
        { text: 'go mod init', description: 'Initialize module', type: 'command' }
      ]
    };
    
    return languageSuggestions[language] || [];
  }

  private rankSuggestions(suggestions: Suggestion[], input: string): Suggestion[] {
    const seen = new Set<string>();
    const unique: Suggestion[] = [];
    
    // Deduplicate
    for (const suggestion of suggestions) {
      const key = suggestion.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }
    
    // Calculate scores
    return unique
      .map(suggestion => ({
        suggestion,
        score: this.calculateScore(suggestion, input)
      }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.suggestion);
  }

  private calculateScore(suggestion: Suggestion, input: string): number {
    let score = 0;
    const lowerInput = input.toLowerCase();
    const lowerText = suggestion.text.toLowerCase();
    
    // Exact match
    if (lowerText === lowerInput) {
      score += 10;
    }
    
    // Starts with input
    if (lowerText.startsWith(lowerInput)) {
      score += 5;
    }
    
    // Contains input
    if (lowerText.includes(lowerInput)) {
      score += 2;
    }
    
    // Type bonuses
    if (suggestion.type === 'command') {
      score += 1;
    }
    
    // User preference
    const selectionCount = this.userSelectionHistory.get(suggestion.text) || 0;
    score += selectionCount * 0.5;
    
    // Recent history bonus
    const historyIndex = this.recentInputs.indexOf(suggestion.text);
    if (historyIndex >= 0) {
      score += (10 - historyIndex) * 0.3;
    }
    
    return score;
  }

  formatSuggestion(suggestion: Suggestion, isSelected: boolean = false): string {
    const icons: Record<string, string> = {
      command: '⚡',
      file: '📄',
      tool: '🔧',
      history: '⏱️'
    };
    
    const icon = icons[suggestion.type] || '•';
    
    // Enhanced formatting with more visual cues
    let text = `${icon} ${suggestion.text}`;
    
    if (suggestion.description?.includes('⭐')) {
      text = chalk.yellow(text); // Highlight highly recommended
    } else if (suggestion.description?.includes('✨')) {
      text = chalk.cyan(text); // Highlight suggested
    }
    
    if (isSelected) {
      text = chalk.bgBlue.white(` ${text} `);
    } else {
      text = chalk.dim(text);
    }
    
    const desc = suggestion.description ? 
      chalk.dim.italic(` - ${suggestion.description}`) : '';
    
    return text + desc;
  }

  async onSuggestionSelected(suggestion: Suggestion) {
    // Update selection history
    const count = this.userSelectionHistory.get(suggestion.text) || 0;
    this.userSelectionHistory.set(suggestion.text, count + 1);
    
    // Learn from the selection
    const index = this.lastSuggestions.findIndex(s => s.text === suggestion.text);
    if (index >= 0) {
      await this.predictiveSuggestions.learnFromInteraction(
        suggestion.text,
        undefined,
        true
      );
    }
  }

  updateContext(update: any) {
    this.currentContext = { ...this.currentContext, ...update };
    this.predictiveSuggestions.updateContext(update);
  }
}