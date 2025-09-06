import { ChatMessage } from '../providers/lmstudio.js';

export interface ConversationTopic {
  topic: string;
  keywords: string[];
  timestamp: Date;
  messageIndex: number;
}

export interface ConversationIntent {
  type: 'question' | 'request' | 'follow-up' | 'clarification' | 'confirmation';
  subject: string;
  relatedTo?: number; // Index of related message
}

export class ConversationMemory {
  private topics: ConversationTopic[] = [];
  private intents: Map<number, ConversationIntent> = new Map();
  private lastSearchQuery?: string;
  private lastFileOperation?: string;
  private currentContext: string = 'general';
  
  analyze(messages: ChatMessage[]): void {
    messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        this.analyzeUserMessage(msg.content, index);
      } else if (msg.role === 'assistant') {
        this.analyzeAssistantMessage(msg.content, index);
      }
    });
  }
  
  private analyzeUserMessage(content: string, index: number): void {
    const lower = content.toLowerCase();
    
    // Extract topics
    const topicPatterns = [
      { pattern: /погод[аеу]|weather/i, topic: 'weather' },
      { pattern: /файл|папк|директор|file|folder|directory/i, topic: 'files' },
      { pattern: /проект|project|код|code/i, topic: 'project' },
      { pattern: /ошибк|error|исправ|fix|debug/i, topic: 'debugging' },
      { pattern: /поиск|найти|search|find/i, topic: 'search' }
    ];
    
    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(content)) {
        this.topics.push({
          topic,
          keywords: this.extractKeywords(content),
          timestamp: new Date(),
          messageIndex: index
        });
      }
    }
    
    // Detect intent
    const intent = this.detectIntent(content, index);
    if (intent) {
      this.intents.set(index, intent);
    }
  }
  
  private analyzeAssistantMessage(content: string, index: number): void {
    // Track what the assistant said/did
    if (content.includes('Directory:') || content.includes('📁')) {
      this.currentContext = 'file_browser';
    } else if (content.includes('Project Analysis') || content.includes('анализ проекта')) {
      this.currentContext = 'project_analysis';
    }
  }
  
  private detectIntent(content: string, index: number): ConversationIntent | null {
    const lower = content.toLowerCase();
    
    // Follow-up patterns
    if (this.isFollowUp(lower, index)) {
      return {
        type: 'follow-up',
        subject: this.getLastTopic() || 'previous request',
        relatedTo: this.getLastUserMessageIndex(index)
      };
    }
    
    // Question patterns
    if (/\?|что|как|где|когда|какой|какая|what|how|where|when|which/.test(lower)) {
      return {
        type: 'question',
        subject: this.extractSubject(content)
      };
    }
    
    // Request patterns
    if (/покажи|создай|удали|запусти|найди|show|create|delete|run|find/.test(lower)) {
      return {
        type: 'request',
        subject: this.extractSubject(content)
      };
    }
    
    return null;
  }
  
  private isFollowUp(content: string, currentIndex: number): boolean {
    // Short messages that reference previous context
    const followUpIndicators = [
      /^(да|нет|yes|no)/,
      /это|that|there|тут|здесь/,
      /ещ[её]|еще|more|больше/,
      /тоже|также|also|too/,
      /посмотр|look|проверь|check/,
      /интернет|online|сеть|web/
    ];
    
    // Check if it's a short message with follow-up indicators
    const isShort = content.split(' ').length < 6;
    const hasIndicator = followUpIndicators.some(p => p.test(content));
    const hasRecentContext = currentIndex > 0 && this.topics.length > 0;
    
    return isShort && hasIndicator && hasRecentContext;
  }
  
  private extractKeywords(content: string): string[] {
    // Extract important words
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = ['в', 'на', 'и', 'или', 'the', 'a', 'an', 'in', 'on', 'and', 'or'];
    return words.filter(w => w.length > 2 && !stopWords.includes(w));
  }
  
  private extractSubject(content: string): string {
    // Try to extract what the user is talking about
    const match = content.match(/(?:о|об|про|about|for)\s+(.+?)(?:\?|$)/i);
    if (match) return match[1];
    
    // Extract object of action verbs
    const actionMatch = content.match(/(?:покажи|show|найди|find|создай|create)\s+(.+?)(?:\s|$)/i);
    if (actionMatch) return actionMatch[1];
    
    return content.substring(0, 50);
  }
  
  getLastTopic(): string | undefined {
    return this.topics.length > 0 ? 
      this.topics[this.topics.length - 1].topic : 
      undefined;
  }
  
  getLastUserMessageIndex(beforeIndex: number): number {
    for (let i = beforeIndex - 1; i >= 0; i--) {
      if (this.intents.has(i)) {
        const intent = this.intents.get(i);
        if (intent?.type !== 'follow-up') {
          return i;
        }
      }
    }
    return Math.max(0, beforeIndex - 2);
  }
  
  getCurrentContext(): string {
    return this.currentContext;
  }
  
  getRecentTopics(limit: number = 3): ConversationTopic[] {
    return this.topics.slice(-limit);
  }
  
  getLastIntent(): ConversationIntent | undefined {
    const lastIndex = Math.max(...Array.from(this.intents.keys()));
    return this.intents.get(lastIndex);
  }
  
  findRelatedContent(currentMessage: string): string | null {
    const keywords = this.extractKeywords(currentMessage);
    
    // Find recent topics with matching keywords
    for (let i = this.topics.length - 1; i >= 0; i--) {
      const topic = this.topics[i];
      const hasMatch = keywords.some(kw => 
        topic.keywords.some(tkw => tkw.includes(kw) || kw.includes(tkw))
      );
      
      if (hasMatch) {
        return topic.keywords.join(' ');
      }
    }
    
    return null;
  }
}