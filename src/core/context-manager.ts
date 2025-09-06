import { ChatMessage } from '../providers/lmstudio.js';
import { encode } from 'gpt-3-encoder';

export interface ContextWindow {
  messages: ChatMessage[];
  tokenCount: number;
  summary?: string;
}

export interface ContextOptions {
  maxTokens: number;
  preserveSystemPrompt: boolean;
  preserveRecentMessages: number;
  summarizeThreshold: number;
}

export class ContextManager {
  private options: ContextOptions;
  private conversationSummaries: Map<number, string> = new Map();

  constructor(options?: Partial<ContextOptions>) {
    this.options = {
      maxTokens: options?.maxTokens || 4000,
      preserveSystemPrompt: options?.preserveSystemPrompt !== false,
      preserveRecentMessages: options?.preserveRecentMessages || 5,
      summarizeThreshold: options?.summarizeThreshold || 0.8, // Start summarizing at 80% capacity
    };
  }

  async optimizeContext(messages: ChatMessage[]): Promise<ContextWindow> {
    if (messages.length === 0) {
      return { messages: [], tokenCount: 0 };
    }

    // Calculate token counts for all messages
    const tokenCounts = messages.map(msg => this.countTokens(msg.content));
    const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

    // If within limits, return all messages
    if (totalTokens <= this.options.maxTokens) {
      return {
        messages,
        tokenCount: totalTokens,
      };
    }

    // Need to optimize - use sliding window approach
    return this.applySlidingWindow(messages, tokenCounts);
  }

  private applySlidingWindow(messages: ChatMessage[], tokenCounts: number[]): ContextWindow {
    const optimized: ChatMessage[] = [];
    let currentTokens = 0;
    
    // Always preserve system prompt if present
    let startIndex = 0;
    if (this.options.preserveSystemPrompt && messages[0]?.role === 'system') {
      optimized.push(messages[0]);
      currentTokens += tokenCounts[0];
      startIndex = 1;
    }

    // Check if we need to summarize older messages
    const shouldSummarize = currentTokens > this.options.maxTokens * this.options.summarizeThreshold;
    
    if (shouldSummarize && messages.length > this.options.preserveRecentMessages * 2) {
      // Create a summary of older messages
      const summaryEndIndex = messages.length - this.options.preserveRecentMessages * 2;
      const messagesToSummarize = messages.slice(startIndex, summaryEndIndex);
      
      if (messagesToSummarize.length > 0) {
        const summary = this.createConversationSummary(messagesToSummarize);
        optimized.push({
          role: 'system',
          content: `[Previous conversation summary: ${summary}]`,
        });
        currentTokens += this.countTokens(summary) + 30; // Add some buffer
        
        startIndex = summaryEndIndex;
      }
    }

    // Add messages from the end, working backwards to preserve recent context
    const remainingTokenBudget = this.options.maxTokens - currentTokens;
    const recentMessages: ChatMessage[] = [];
    let recentTokens = 0;
    
    for (let i = messages.length - 1; i >= startIndex; i--) {
      const messageTokens = tokenCounts[i];
      if (recentTokens + messageTokens <= remainingTokenBudget) {
        recentMessages.unshift(messages[i]);
        recentTokens += messageTokens;
      } else if (recentMessages.length < this.options.preserveRecentMessages * 2) {
        // Always keep minimum recent messages for context
        recentMessages.unshift(messages[i]);
        recentTokens += messageTokens;
      } else {
        break;
      }
    }

    optimized.push(...recentMessages);

    return {
      messages: optimized,
      tokenCount: currentTokens + recentTokens,
      summary: shouldSummarize ? 'Context optimized with conversation summary' : undefined,
    };
  }

  private createConversationSummary(messages: ChatMessage[]): string {
    // Simple summarization - in production, this could use an LLM
    const topics = new Set<string>();
    const actions = new Set<string>();
    
    messages.forEach(msg => {
      if (msg.role === 'user') {
        // Extract topics from user messages
        const words = msg.content.toLowerCase().split(/\s+/);
        words.forEach(word => {
          if (word.length > 5 && !this.isCommonWord(word)) {
            topics.add(word);
          }
        });
      } else if (msg.role === 'assistant') {
        // Extract actions from assistant messages
        if (msg.content.includes('created') || msg.content.includes('Created')) {
          actions.add('file creation');
        }
        if (msg.content.includes('edited') || msg.content.includes('Edited')) {
          actions.add('file editing');
        }
        if (msg.content.includes('searched') || msg.content.includes('Searched')) {
          actions.add('web search');
        }
        if (msg.content.includes('executed') || msg.content.includes('Executed')) {
          actions.add('command execution');
        }
      }
    });

    const topicList = Array.from(topics).slice(0, 5).join(', ');
    const actionList = Array.from(actions).join(', ');
    
    return `Discussed topics: ${topicList || 'general conversation'}. Actions performed: ${actionList || 'conversation only'}.`;
  }

  private countTokens(text: string): number {
    try {
      return encode(text).length;
    } catch (error) {
      // Fallback to character-based estimation
      return Math.ceil(text.length / 4);
    }
  }

  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have',
      'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
      'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they',
      'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'would',
      'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about',
      'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can',
      'like', 'time', 'no', 'just', 'him', 'know', 'take', 'person',
      'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
      'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its',
      'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how',
      'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
      'any', 'these', 'give', 'day', 'most', 'us'
    ]);
    
    return commonWords.has(word.toLowerCase());
  }

  updateOptions(options: Partial<ContextOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getTokenBudget(): number {
    return this.options.maxTokens;
  }

  async analyzeConversation(messages: ChatMessage[]): Promise<{
    totalTokens: number;
    messageCount: number;
    avgTokensPerMessage: number;
    longestMessage: { index: number; tokens: number };
    optimizationNeeded: boolean;
  }> {
    const tokenCounts = messages.map(msg => this.countTokens(msg.content));
    const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
    
    let longestIndex = 0;
    let longestTokens = 0;
    tokenCounts.forEach((count, index) => {
      if (count > longestTokens) {
        longestTokens = count;
        longestIndex = index;
      }
    });

    return {
      totalTokens,
      messageCount: messages.length,
      avgTokensPerMessage: Math.round(totalTokens / messages.length),
      longestMessage: { index: longestIndex, tokens: longestTokens },
      optimizationNeeded: totalTokens > this.options.maxTokens,
    };
  }
}