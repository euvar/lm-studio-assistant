import { LMStudioProvider } from '../providers/lmstudio.js';

interface FeedbackEntry {
  timestamp: number;
  userInput: string;
  intent: any;
  action: any;
  result: any;
  userFeedback?: 'positive' | 'negative' | 'corrected';
  correction?: string;
}

interface LearningInsight {
  pattern: string;
  confidence: number;
  examples: FeedbackEntry[];
  recommendation: string;
}

export class LearningFromFeedback {
  private feedbackHistory: FeedbackEntry[] = [];
  private learningInsights: Map<string, LearningInsight> = new Map();

  constructor(private provider: LMStudioProvider) {}

  async recordInteraction(
    userInput: string,
    intent: any,
    action: any,
    result: any
  ): Promise<void> {
    this.feedbackHistory.push({
      timestamp: Date.now(),
      userInput,
      intent,
      action,
      result
    });

    // Periodically analyze patterns
    if (this.feedbackHistory.length % 10 === 0) {
      await this.analyzePatterns();
    }
  }

  async processFeedback(
    interactionId: number,
    feedback: 'positive' | 'negative' | 'corrected',
    correction?: string
  ): Promise<void> {
    if (interactionId < this.feedbackHistory.length) {
      this.feedbackHistory[interactionId].userFeedback = feedback;
      if (correction) {
        this.feedbackHistory[interactionId].correction = correction;
      }

      // Learn from negative feedback immediately
      if (feedback === 'negative' || feedback === 'corrected') {
        await this.learnFromMistake(this.feedbackHistory[interactionId]);
      }
    }
  }

  private async learnFromMistake(entry: FeedbackEntry): Promise<void> {
    const learningPrompt = `
Analyze this interaction where we made a mistake:

USER INPUT: "${entry.userInput}"
OUR UNDERSTANDING: ${JSON.stringify(entry.intent)}
OUR ACTION: ${JSON.stringify(entry.action)}
RESULT: ${JSON.stringify(entry.result)}
FEEDBACK: ${entry.userFeedback}
${entry.correction ? `CORRECTION: ${entry.correction}` : ''}

Learn from this mistake:
1. What did we misunderstand?
2. What pattern should we recognize?
3. How should we handle similar requests in the future?

RESPOND IN JSON:
{
  "misunderstanding": "what went wrong",
  "pattern": "pattern to recognize",
  "correctApproach": "how to handle correctly",
  "similarPhrases": ["phrase1", "phrase2"],
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'Learn from user feedback to improve future interactions.'
        },
        { role: 'user', content: learningPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const learning = JSON.parse(cleanedContent.trim());

      // Store learning insight
      const insight: LearningInsight = {
        pattern: learning.pattern,
        confidence: learning.confidence,
        examples: [entry],
        recommendation: learning.correctApproach
      };

      this.learningInsights.set(learning.pattern, insight);
    } catch (error) {
      console.error('Failed to learn from mistake:', error);
    }
  }

  private async analyzePatterns(): Promise<void> {
    // Analyze recent interactions for patterns
    const recentEntries = this.feedbackHistory.slice(-50);
    
    const analysisPrompt = `
Analyze these recent interactions to find patterns:

${recentEntries.map((e: FeedbackEntry, i: number) => `
${i + 1}. Input: "${e.userInput}"
   Intent: ${e.intent.type}
   Success: ${e.userFeedback || 'unknown'}
`).join('\n')}

Identify:
1. Common successful patterns
2. Common failure patterns
3. Ambiguous phrases that need clarification
4. Recommendations for improvement

RESPOND IN JSON:
{
  "successPatterns": [
    {"pattern": "description", "examples": [1, 2, 3]}
  ],
  "failurePatterns": [
    {"pattern": "description", "examples": [4, 5], "suggestion": "improvement"}
  ],
  "ambiguousPatterns": [
    {"pattern": "description", "clarificationNeeded": "what to ask"}
  ],
  "overallInsights": ["insight1", "insight2"]
}`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'Analyze interaction patterns to improve understanding.'
        },
        { role: 'user', content: analysisPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const patterns = JSON.parse(cleanedContent.trim());

      // Update learning insights based on patterns
      for (const failure of patterns.failurePatterns) {
        const examples = failure.examples.map((i: number) => recentEntries[i]);
        this.learningInsights.set(failure.pattern, {
          pattern: failure.pattern,
          confidence: 0.8,
          examples,
          recommendation: failure.suggestion
        });
      }
    } catch (error) {
      console.error('Failed to analyze patterns:', error);
    }
  }

  async applyLearning(userInput: string, initialIntent: any): Promise<{
    shouldAdjust: boolean;
    adjustedIntent?: any;
    reason?: string;
  }> {
    // Check if we have learned insights that apply
    const relevantInsights: LearningInsight[] = [];

    for (const insight of this.learningInsights.values()) {
      // Check if this input matches a learned pattern
      const matches = await this.checkPatternMatch(userInput, insight);
      if (matches) {
        relevantInsights.push(insight);
      }
    }

    if (relevantInsights.length === 0) {
      return { shouldAdjust: false };
    }

    // Apply the most confident insight
    const bestInsight = relevantInsights.reduce((a, b) => 
      a.confidence > b.confidence ? a : b
    );

    const adjustmentPrompt = `
Based on learned patterns, should we adjust our understanding?

USER INPUT: "${userInput}"
INITIAL INTENT: ${JSON.stringify(initialIntent)}
LEARNED PATTERN: ${bestInsight.pattern}
RECOMMENDATION: ${bestInsight.recommendation}
CONFIDENCE: ${bestInsight.confidence}

Should we adjust our approach based on this learning?

RESPOND IN JSON:
{
  "shouldAdjust": true/false,
  "adjustedIntent": adjusted intent object or null,
  "reason": "explanation"
}`;

    try {
      const response = await this.provider.chat([
        {
          role: 'system',
          content: 'Apply learned patterns to improve intent understanding.'
        },
        { role: 'user', content: adjustmentPrompt }
      ]);

      let cleanedContent = response.content;
      if (cleanedContent.includes('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      return JSON.parse(cleanedContent.trim());
    } catch {
      return { shouldAdjust: false };
    }
  }

  private async checkPatternMatch(
    userInput: string, 
    insight: LearningInsight
  ): Promise<boolean> {
    // Use LLM to check if input matches learned pattern
    const matchPrompt = `
Does this input match the learned pattern?

INPUT: "${userInput}"
PATTERN: ${insight.pattern}
EXAMPLES: ${insight.examples.map(e => e.userInput).join(', ')}

Answer with just "yes" or "no".`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'Check pattern matches.' },
        { role: 'user', content: matchPrompt }
      ]);

      return response.content.toLowerCase().includes('yes');
    } catch {
      return false;
    }
  }

  getInsights(): LearningInsight[] {
    return Array.from(this.learningInsights.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  exportLearnings(): string {
    const learnings = {
      totalInteractions: this.feedbackHistory.length,
      insights: this.getInsights(),
      successRate: this.calculateSuccessRate()
    };

    return JSON.stringify(learnings, null, 2);
  }

  private calculateSuccessRate(): number {
    const rated = this.feedbackHistory.filter(e => e.userFeedback);
    if (rated.length === 0) return 0;

    const positive = rated.filter(e => e.userFeedback === 'positive').length;
    return positive / rated.length;
  }
}