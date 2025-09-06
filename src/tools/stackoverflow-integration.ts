import { Tool, ToolResult } from './base.js';
import axios from 'axios';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

interface StackOverflowQuestion {
  question_id: number;
  title: string;
  body: string;
  link: string;
  score: number;
  is_answered: boolean;
  view_count: number;
  tags: string[];
  owner: {
    display_name: string;
    reputation: number;
  };
}

interface StackOverflowAnswer {
  answer_id: number;
  body: string;
  score: number;
  is_accepted: boolean;
  owner: {
    display_name: string;
    reputation: number;
  };
}

export class StackOverflowTool implements Tool {
  name = 'searchStackOverflow';
  description = 'Search Stack Overflow for programming questions and solutions';
  private apiBase = 'https://api.stackexchange.com/2.3';
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.STACKOVERFLOW_API_KEY;
  }

  async execute(params: {
    query: string;
    tags?: string[];
    sort?: 'relevance' | 'votes' | 'creation' | 'activity';
    limit?: number;
    includeAnswers?: boolean;
  }): Promise<ToolResult> {
    const { 
      query, 
      tags = [], 
      sort = 'relevance', 
      limit = 5,
      includeAnswers = true 
    } = params;

    try {
      // Search for questions
      const questions = await this.searchQuestions(query, tags, sort, limit);
      
      if (questions.length === 0) {
        return { success: true, data: 'No relevant questions found on Stack Overflow.' };
      }

      const results: string[] = [];
      
      // Process each question
      for (const question of questions) {
        let questionResult = this.formatQuestion(question);
        
        // Get answers if requested
        if (includeAnswers && question.is_answered) {
          const answers = await this.getAnswers(question.question_id);
          if (answers.length > 0) {
            questionResult += '\n\n📋 Top Answers:\n';
            questionResult += this.formatAnswers(answers);
          }
        }
        
        results.push(questionResult);
      }
      
      return { success: true, data: results.join('\n\n' + '─'.repeat(80) + '\n\n') };
      
    } catch (error) {
      return {
        success: false,
        error: `Stack Overflow search failed: ${(error as Error).message}`
      };
    }
  }

  private async searchQuestions(
    query: string, 
    tags: string[], 
    sort: string, 
    limit: number
  ): Promise<StackOverflowQuestion[]> {
    const params: any = {
      order: 'desc',
      sort,
      q: query,
      site: 'stackoverflow',
      filter: 'withbody',
      pagesize: limit
    };

    if (tags.length > 0) {
      params.tagged = tags.join(';');
    }

    if (this.apiKey) {
      params.key = this.apiKey;
    }

    const response = await axios.get(`${this.apiBase}/search/advanced`, {
      params,
      responseType: 'arraybuffer'
    });

    // Stack Overflow API returns gzipped responses
    const decompressed = await gunzip(response.data);
    const data = JSON.parse(decompressed.toString());
    
    return data.items || [];
  }

  private async getAnswers(questionId: number): Promise<StackOverflowAnswer[]> {
    const params: any = {
      order: 'desc',
      sort: 'votes',
      site: 'stackoverflow',
      filter: 'withbody',
      pagesize: 3 // Get top 3 answers
    };

    if (this.apiKey) {
      params.key = this.apiKey;
    }

    const response = await axios.get(
      `${this.apiBase}/questions/${questionId}/answers`,
      {
        params,
        responseType: 'arraybuffer'
      }
    );

    const decompressed = await gunzip(response.data);
    const data = JSON.parse(decompressed.toString());
    
    return data.items || [];
  }

  private formatQuestion(question: StackOverflowQuestion): string {
    const tags = question.tags.map(tag => `[${tag}]`).join(' ');
    
    return `❓ ${question.title}
${tags}
Score: ${question.score} | Views: ${question.view_count} | ${question.is_answered ? '✅ Answered' : '❌ Unanswered'}
Link: ${question.link}

${this.stripHTML(question.body).substring(0, 500)}...`;
  }

  private formatAnswers(answers: StackOverflowAnswer[]): string {
    return answers.map((answer, index) => {
      const status = answer.is_accepted ? '✅ Accepted' : '';
      const header = `Answer ${index + 1} (Score: ${answer.score}) ${status}`;
      const body = this.stripHTML(answer.body).substring(0, 400);
      
      return `${header}\n${body}...`;
    }).join('\n\n');
  }

  private stripHTML(html: string): string {
    // Simple HTML stripping - in production, use a proper HTML parser
    return html
      .replace(/<pre><code>/g, '\n```\n')
      .replace(/<\/code><\/pre>/g, '\n```\n')
      .replace(/<code>/g, '`')
      .replace(/<\/code>/g, '`')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (e.g., ["javascript", "react"])'
        },
        sort: {
          type: 'string',
          enum: ['relevance', 'votes', 'creation', 'activity'],
          description: 'Sort order (default: relevance)'
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default: 5)'
        },
        includeAnswers: {
          type: 'boolean',
          description: 'Include answers for each question (default: true)'
        }
      },
      required: ['query']
    };
  }
}

// Advanced solution finder that combines Stack Overflow with code analysis
export class SolutionFinderTool implements Tool {
  name = 'findSolution';
  description = 'Find and analyze solutions for programming problems';
  private stackOverflow: StackOverflowTool;

  constructor(apiKey?: string) {
    this.stackOverflow = new StackOverflowTool(apiKey);
  }

  async execute(params: {
    problem: string;
    language?: string;
    framework?: string;
    preferredApproach?: 'simple' | 'optimal' | 'modern';
  }): Promise<ToolResult> {
    const { problem, language, framework, preferredApproach = 'optimal' } = params;
    
    try {
      // Build search query
      const tags: string[] = [];
      if (language) tags.push(language.toLowerCase());
      if (framework) tags.push(framework.toLowerCase());
      
      // Search Stack Overflow
      const stackResults = await this.stackOverflow.execute({
        query: problem,
        tags,
        sort: 'votes',
        limit: 3,
        includeAnswers: true
      });
      
      // Analyze solutions
      const analysis = this.analyzeSolutions(stackResults.data as string, preferredApproach);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(problem, analysis);
      
      return {
        success: true,
        data: `🔍 Solution Analysis for: "${problem}"

📚 Stack Overflow Results:
${stackResults.data}

💡 Analysis:
${analysis}

🎯 Recommendations:
${recommendations}`
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Solution finding failed: ${(error as Error).message}`
      };
    }
  }

  private analyzeSolutions(results: string, approach: string): string {
    const analysis: string[] = [];
    
    // Extract code snippets
    const codeBlocks = results.match(/```[\s\S]*?```/g) || [];
    if (codeBlocks.length > 0) {
      analysis.push(`Found ${codeBlocks.length} code examples`);
    }
    
    // Check for common patterns
    const patterns = {
      async: /async|await|promise/i,
      functional: /map|filter|reduce|forEach/i,
      oop: /class|extends|constructor/i,
      error: /try|catch|error|exception/i
    };
    
    const foundPatterns: string[] = [];
    for (const [name, pattern] of Object.entries(patterns)) {
      if (pattern.test(results)) {
        foundPatterns.push(name);
      }
    }
    
    if (foundPatterns.length > 0) {
      analysis.push(`Patterns detected: ${foundPatterns.join(', ')}`);
    }
    
    // Approach-specific analysis
    switch (approach) {
      case 'simple':
        analysis.push('Focus on straightforward, easy-to-understand solutions');
        break;
      case 'optimal':
        analysis.push('Prioritizing performance and best practices');
        break;
      case 'modern':
        analysis.push('Using latest language features and patterns');
        break;
    }
    
    return analysis.join('\n');
  }

  private generateRecommendations(problem: string, analysis: string): string {
    const recommendations: string[] = [];
    
    // General recommendations based on problem type
    const problemLower = problem.toLowerCase();
    
    if (problemLower.includes('performance') || problemLower.includes('slow')) {
      recommendations.push('• Consider profiling your code to identify bottlenecks');
      recommendations.push('• Look into caching strategies');
      recommendations.push('• Check for unnecessary loops or operations');
    }
    
    if (problemLower.includes('error') || problemLower.includes('bug')) {
      recommendations.push('• Add comprehensive error handling');
      recommendations.push('• Implement logging for debugging');
      recommendations.push('• Write unit tests to catch edge cases');
    }
    
    if (problemLower.includes('async') || problemLower.includes('promise')) {
      recommendations.push('• Use async/await for cleaner code');
      recommendations.push('• Handle promise rejections properly');
      recommendations.push('• Consider race conditions');
    }
    
    // Add general best practices
    recommendations.push('• Follow the DRY principle (Don\'t Repeat Yourself)');
    recommendations.push('• Keep functions small and focused');
    recommendations.push('• Add meaningful comments and documentation');
    
    return recommendations.join('\n');
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        problem: {
          type: 'string',
          description: 'Description of the programming problem'
        },
        language: {
          type: 'string',
          description: 'Programming language (e.g., "javascript", "python")'
        },
        framework: {
          type: 'string',
          description: 'Framework if applicable (e.g., "react", "django")'
        },
        preferredApproach: {
          type: 'string',
          enum: ['simple', 'optimal', 'modern'],
          description: 'Preferred solution approach'
        }
      },
      required: ['problem']
    };
  }
}

// Export tools
export const stackOverflowTool = new StackOverflowTool();
export const solutionFinderTool = new SolutionFinderTool();