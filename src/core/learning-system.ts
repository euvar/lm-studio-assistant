import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export interface LearnedPattern {
  input: string;
  expectedBehavior: 'tools' | 'no-tools';
  actualBehavior: 'tools' | 'no-tools';
  model: string;
  timestamp: Date;
  corrected?: boolean;
}

export interface ModelProfile {
  modelName: string;
  successRate: number;
  patterns: {
    overusesTools: string[];
    missesTools: string[];
    keywords: {
      triggersTools: string[];
      avoidsTools: string[];
    };
  };
}

export class LearningSystem {
  private dataPath: string;
  private patterns: LearnedPattern[] = [];
  
  constructor() {
    this.dataPath = path.join(process.env.HOME || '', '.lm-studio-assistant', 'learning-data.json');
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      const data = await fs.readFile(this.dataPath, 'utf-8');
      this.patterns = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet
      this.patterns = [];
    }
  }

  async recordInteraction(
    input: string,
    expectedBehavior: 'tools' | 'no-tools',
    actualBehavior: 'tools' | 'no-tools',
    modelName: string
  ): Promise<void> {
    const pattern: LearnedPattern = {
      input,
      expectedBehavior,
      actualBehavior,
      model: modelName,
      timestamp: new Date()
    };
    
    this.patterns.push(pattern);
    
    // Keep only last 1000 patterns
    if (this.patterns.length > 1000) {
      this.patterns = this.patterns.slice(-1000);
    }
    
    await this.save();
  }

  async correctPattern(input: string, correctBehavior: 'tools' | 'no-tools'): Promise<void> {
    const pattern = this.patterns.find(p => p.input === input && !p.corrected);
    if (pattern) {
      pattern.expectedBehavior = correctBehavior;
      pattern.corrected = true;
      await this.save();
    }
  }

  getModelProfile(modelName: string): ModelProfile {
    const modelPatterns = this.patterns.filter(p => p.model === modelName);
    
    const correct = modelPatterns.filter(p => p.expectedBehavior === p.actualBehavior).length;
    const total = modelPatterns.length;
    const successRate = total > 0 ? (correct / total) * 100 : 0;
    
    // Find patterns where model overuses tools
    const overusesTools = modelPatterns
      .filter(p => p.expectedBehavior === 'no-tools' && p.actualBehavior === 'tools')
      .map(p => p.input);
    
    // Find patterns where model misses tools
    const missesTools = modelPatterns
      .filter(p => p.expectedBehavior === 'tools' && p.actualBehavior === 'no-tools')
      .map(p => p.input);
    
    // Extract keywords
    const triggersTools = this.extractKeywords(
      modelPatterns.filter(p => p.actualBehavior === 'tools').map(p => p.input)
    );
    
    const avoidsTools = this.extractKeywords(
      modelPatterns.filter(p => p.actualBehavior === 'no-tools').map(p => p.input)
    );
    
    return {
      modelName,
      successRate,
      patterns: {
        overusesTools: this.getUniquePatterns(overusesTools),
        missesTools: this.getUniquePatterns(missesTools),
        keywords: {
          triggersTools,
          avoidsTools
        }
      }
    };
  }

  generateAdaptivePrompt(modelName: string, basePrompt: string): string {
    const profile = this.getModelProfile(modelName);
    
    if (profile.successRate > 90 || profile.patterns.overusesTools.length === 0) {
      return basePrompt; // Model is performing well
    }
    
    // Add corrections based on learned patterns
    let adaptivePrompt = basePrompt + '\n\n## Model-Specific Adjustments\n';
    
    if (profile.patterns.overusesTools.length > 0) {
      adaptivePrompt += '\nIMPORTANT: This model tends to overuse tools. Be extra careful:\n';
      adaptivePrompt += '- Simple greetings like "Привет" NEVER need tools\n';
      adaptivePrompt += '- General knowledge questions do NOT need web search\n';
    }
    
    if (profile.patterns.missesTools.length > 0) {
      adaptivePrompt += '\nIMPORTANT: This model tends to miss tool usage. Remember:\n';
      adaptivePrompt += '- "найди", "поищи", "search" → ALWAYS use tools\n';
      adaptivePrompt += '- Current info (weather, prices) → ALWAYS use tools\n';
    }
    
    return adaptivePrompt;
  }

  private extractKeywords(inputs: string[]): string[] {
    const wordFrequency = new Map<string, number>();
    
    inputs.forEach(input => {
      const words = input.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) { // Skip short words
          wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        }
      });
    });
    
    // Get top 10 most frequent words
    return Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private getUniquePatterns(patterns: string[]): string[] {
    // Group similar patterns
    const unique = new Map<string, number>();
    
    patterns.forEach(pattern => {
      const normalized = pattern.toLowerCase().trim();
      unique.set(normalized, (unique.get(normalized) || 0) + 1);
    });
    
    // Return top 5 most common
    return Array.from(unique.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.dataPath, JSON.stringify(this.patterns, null, 2));
  }

  async generateReport(): Promise<string> {
    const modelNames = [...new Set(this.patterns.map(p => p.model))];
    let report = chalk.blue('\n📊 Learning System Report\n\n');
    
    modelNames.forEach(modelName => {
      const profile = this.getModelProfile(modelName);
      report += chalk.cyan(`Model: ${modelName}\n`);
      report += `Success Rate: ${profile.successRate.toFixed(1)}%\n`;
      
      if (profile.patterns.overusesTools.length > 0) {
        report += chalk.yellow('\nOveruses tools for:\n');
        profile.patterns.overusesTools.forEach(p => {
          report += `  - "${p}"\n`;
        });
      }
      
      if (profile.patterns.missesTools.length > 0) {
        report += chalk.yellow('\nMisses tools for:\n');
        profile.patterns.missesTools.forEach(p => {
          report += `  - "${p}"\n`;
        });
      }
      
      report += '\n';
    });
    
    return report;
  }
}