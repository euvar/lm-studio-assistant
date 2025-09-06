import { EventEmitter } from 'events';
import { LMStudioProvider } from '../providers/lmstudio.js';
import { CodeIntelligence } from './code-intelligence.js';
import { RichOutput } from './rich-output.js';
import chalk from 'chalk';

interface Solution {
  id: string;
  approach: string;
  description: string;
  pros: string[];
  cons: string[];
  implementation: string;
  complexity: 'simple' | 'moderate' | 'complex';
  timeEstimate: number;
  technologies: string[];
  score: number;
  userRating?: number;
}

interface CreativeRequest {
  problem: string;
  constraints?: string[];
  preferences?: string[];
  context?: any;
}

interface CreativeResult {
  request: CreativeRequest;
  solutions: Solution[];
  recommendation: Solution | null;
  comparison: ComparisonMatrix;
  timestamp: Date;
}

interface ComparisonMatrix {
  criteria: string[];
  scores: Map<string, Map<string, number>>; // solutionId -> criterion -> score
}

export class CreativeMode extends EventEmitter {
  private provider: LMStudioProvider;
  private codeIntelligence: CodeIntelligence;
  private richOutput: RichOutput;
  private solutionHistory: Map<string, CreativeResult> = new Map();

  constructor(provider: LMStudioProvider) {
    super();
    this.provider = provider;
    this.codeIntelligence = new CodeIntelligence();
    this.richOutput = new RichOutput();
  }

  async generateSolutions(request: CreativeRequest): Promise<CreativeResult> {
    this.richOutput.title('Creative Mode', 'banner');
    this.richOutput.subtitle('Generating multiple solutions...');
    
    const spinner = 'creative_spinner';
    this.richOutput.spinner(spinner, 'Analyzing problem and constraints...');
    
    try {
      // Step 1: Analyze the problem deeply
      const analysis = await this.analyzeProblem(request);
      
      // Step 2: Generate diverse solutions
      this.richOutput.spinner(spinner, 'Generating creative solutions...');
      const solutions = await this.generateDiverseSolutions(request, analysis);
      
      // Step 3: Evaluate and score solutions
      this.richOutput.spinner(spinner, 'Evaluating solutions...');
      const scoredSolutions = await this.evaluateSolutions(solutions, request);
      
      // Step 4: Create comparison matrix
      this.richOutput.spinner(spinner, 'Comparing solutions...');
      const comparison = await this.createComparisonMatrix(scoredSolutions, request);
      
      // Step 5: Select recommendation
      const recommendation = this.selectRecommendation(scoredSolutions, comparison);
      
      this.richOutput.spinner(spinner, 'Analysis complete!', 'succeed');
      
      const result: CreativeResult = {
        request,
        solutions: scoredSolutions,
        recommendation,
        comparison,
        timestamp: new Date()
      };
      
      // Store in history
      const resultId = `creative_${Date.now()}`;
      this.solutionHistory.set(resultId, result);
      
      // Display results
      this.displayResults(result);
      
      return result;
    } catch (error) {
      this.richOutput.spinner(spinner, `Error: ${(error as Error).message}`, 'fail');
      throw error;
    }
  }

  private async analyzeProblem(request: CreativeRequest): Promise<any> {
    const analysisPrompt = `Analyze this problem for creative solutions:

Problem: "${request.problem}"
${request.constraints ? `Constraints: ${request.constraints.join(', ')}` : ''}
${request.preferences ? `Preferences: ${request.preferences.join(', ')}` : ''}

Identify:
1. Core requirements
2. Hidden assumptions
3. Potential approaches
4. Key challenges
5. Success criteria

Respond with a JSON object containing your analysis.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are a creative problem solver. Think outside the box.' },
      { role: 'user', content: analysisPrompt }
    ]);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      return { analysis: response.content };
    }
  }

  private async generateDiverseSolutions(request: CreativeRequest, analysis: any): Promise<Solution[]> {
    const solutionPrompt = `Generate 4-5 DIVERSE solutions for this problem:

Problem: "${request.problem}"
Analysis: ${JSON.stringify(analysis)}

Create solutions that are:
1. Different in approach (e.g., simple vs complex, traditional vs innovative)
2. Using different technologies or methods
3. Optimizing for different criteria (speed, maintainability, cost, etc.)
4. Ranging from quick fixes to comprehensive solutions

For each solution, provide:
{
  "approach": "Short name for the approach",
  "description": "Detailed description",
  "pros": ["array of advantages"],
  "cons": ["array of disadvantages"],
  "implementation": "Code or detailed steps",
  "complexity": "simple|moderate|complex",
  "timeEstimate": minutes,
  "technologies": ["array of technologies used"]
}

Be creative! Consider unconventional approaches.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are a creative software architect. Generate diverse, innovative solutions.' },
      { role: 'user', content: solutionPrompt }
    ]);

    let solutions: Solution[] = [];
    
    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const rawSolutions = JSON.parse(jsonMatch[0]);
        solutions = rawSolutions.map((sol: any, index: number) => ({
          id: `sol_${index + 1}`,
          ...sol,
          score: 0
        }));
      }
    } catch (error) {
      // Fallback: generate basic solutions
      solutions = this.generateFallbackSolutions(request);
    }

    return solutions;
  }

  private generateFallbackSolutions(request: CreativeRequest): Solution[] {
    return [
      {
        id: 'sol_1',
        approach: 'Quick and Simple',
        description: 'A straightforward solution focusing on getting it done quickly',
        pros: ['Fast to implement', 'Easy to understand', 'Minimal dependencies'],
        cons: ['May not scale well', 'Limited features', 'Less flexible'],
        implementation: '// Basic implementation',
        complexity: 'simple',
        timeEstimate: 30,
        technologies: ['JavaScript'],
        score: 0
      },
      {
        id: 'sol_2',
        approach: 'Enterprise Grade',
        description: 'A robust, scalable solution following best practices',
        pros: ['Highly scalable', 'Well-structured', 'Comprehensive error handling'],
        cons: ['Complex to implement', 'More time required', 'Over-engineered for simple needs'],
        implementation: '// Enterprise implementation',
        complexity: 'complex',
        timeEstimate: 180,
        technologies: ['TypeScript', 'Docker', 'Kubernetes'],
        score: 0
      },
      {
        id: 'sol_3',
        approach: 'Modern & Innovative',
        description: 'Using cutting-edge technologies and patterns',
        pros: ['Latest technologies', 'Future-proof', 'Great developer experience'],
        cons: ['Newer tech may have issues', 'Steeper learning curve', 'Less community support'],
        implementation: '// Modern implementation',
        complexity: 'moderate',
        timeEstimate: 90,
        technologies: ['Deno', 'WebAssembly', 'Edge Computing'],
        score: 0
      }
    ];
  }

  private async evaluateSolutions(solutions: Solution[], request: CreativeRequest): Promise<Solution[]> {
    const evaluationPrompt = `Evaluate these solutions for the problem: "${request.problem}"

Solutions:
${JSON.stringify(solutions, null, 2)}

Score each solution (0-100) based on:
1. How well it solves the problem
2. Feasibility
3. Maintainability
4. Performance
5. Innovation
6. Alignment with constraints and preferences

Respond with an array of solution IDs and scores:
[{"id": "sol_1", "score": 85, "reasoning": "..."}, ...]`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are an expert evaluator. Score solutions objectively.' },
      { role: 'user', content: evaluationPrompt }
    ]);

    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scores = JSON.parse(jsonMatch[0]);
        
        // Apply scores to solutions
        for (const solution of solutions) {
          const scoreData = scores.find((s: any) => s.id === solution.id);
          if (scoreData) {
            solution.score = scoreData.score;
          }
        }
      }
    } catch (error) {
      // Fallback: random scores
      solutions.forEach(sol => {
        sol.score = 60 + Math.floor(Math.random() * 30);
      });
    }

    return solutions.sort((a, b) => b.score - a.score);
  }

  private async createComparisonMatrix(solutions: Solution[], request: CreativeRequest): Promise<ComparisonMatrix> {
    const criteria = [
      'Implementation Speed',
      'Scalability',
      'Maintainability',
      'Performance',
      'Cost Efficiency',
      'Innovation',
      'Risk Level'
    ];

    const matrix: ComparisonMatrix = {
      criteria,
      scores: new Map()
    };

    // Generate scores for each criterion
    for (const solution of solutions) {
      const criterionScores = new Map<string, number>();
      
      // Simple scoring based on solution properties
      criterionScores.set('Implementation Speed', 
        solution.complexity === 'simple' ? 90 : solution.complexity === 'moderate' ? 60 : 30);
      criterionScores.set('Scalability', 
        solution.technologies.includes('Kubernetes') || solution.technologies.includes('Docker') ? 90 : 50);
      criterionScores.set('Maintainability', 
        solution.pros.some(p => p.toLowerCase().includes('maintain')) ? 80 : 60);
      criterionScores.set('Performance', 
        solution.pros.some(p => p.toLowerCase().includes('performance') || p.toLowerCase().includes('fast')) ? 85 : 60);
      criterionScores.set('Cost Efficiency', 
        solution.complexity === 'simple' ? 85 : solution.complexity === 'moderate' ? 65 : 40);
      criterionScores.set('Innovation', 
        solution.technologies.some(t => ['WebAssembly', 'Edge Computing', 'AI', 'ML'].includes(t)) ? 90 : 50);
      criterionScores.set('Risk Level', 
        solution.complexity === 'simple' ? 20 : solution.complexity === 'moderate' ? 50 : 80);
      
      matrix.scores.set(solution.id, criterionScores);
    }

    return matrix;
  }

  private selectRecommendation(solutions: Solution[], comparison: ComparisonMatrix): Solution | null {
    if (solutions.length === 0) return null;
    
    // Default to highest scored solution
    let recommended = solutions[0];
    
    // But check if user has specific preferences that might override
    // In a real implementation, this would consider user preferences more deeply
    
    return recommended;
  }

  private displayResults(result: CreativeResult) {
    this.richOutput.separator();
    this.richOutput.subtitle('Creative Solutions Generated');
    
    // Display each solution
    for (const [index, solution] of result.solutions.entries()) {
      console.log('\n' + chalk.bold.cyan(`Solution ${index + 1}: ${solution.approach}`));
      console.log(chalk.gray('─'.repeat(50)));
      
      console.log(chalk.white(`Description: ${solution.description}`));
      console.log(chalk.green(`Score: ${solution.score}/100`));
      console.log(chalk.blue(`Complexity: ${solution.complexity}`));
      console.log(chalk.yellow(`Time Estimate: ${solution.timeEstimate} minutes`));
      console.log(chalk.magenta(`Technologies: ${solution.technologies.join(', ')}`));
      
      console.log('\n' + chalk.bold('Pros:'));
      for (const pro of solution.pros) {
        console.log(chalk.green(`  ✓ ${pro}`));
      }
      
      console.log('\n' + chalk.bold('Cons:'));
      for (const con of solution.cons) {
        console.log(chalk.red(`  ✗ ${con}`));
      }
      
      if (solution === result.recommendation) {
        console.log('\n' + chalk.bold.bgGreen.white(' ⭐ RECOMMENDED '));
      }
    }
    
    // Display comparison matrix
    this.richOutput.separator();
    this.richOutput.subtitle('Solution Comparison');
    
    const tableData: any[] = [];
    for (const criterion of result.comparison.criteria) {
      const row: any = { Criterion: criterion };
      
      for (const solution of result.solutions) {
        const score = result.comparison.scores.get(solution.id)?.get(criterion) || 0;
        row[solution.approach] = score;
      }
      
      tableData.push(row);
    }
    
    this.richOutput.table(tableData);
    
    // Implementation preview
    if (result.recommendation) {
      this.richOutput.separator();
      this.richOutput.subtitle(`Recommended Implementation: ${result.recommendation.approach}`);
      this.richOutput.code(result.recommendation.implementation, 'javascript');
    }
  }

  // Interactive solution refinement
  async refineSolution(solutionId: string, feedback: string): Promise<Solution> {
    const history = Array.from(this.solutionHistory.values());
    const result = history.find(r => r.solutions.some(s => s.id === solutionId));
    
    if (!result) {
      throw new Error('Solution not found');
    }
    
    const solution = result.solutions.find(s => s.id === solutionId)!;
    
    const refinementPrompt = `Refine this solution based on user feedback:

Original Solution:
${JSON.stringify(solution, null, 2)}

User Feedback: "${feedback}"

Generate an improved version of this solution that addresses the feedback.
Maintain the same structure but update the content.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are refining a solution based on feedback. Keep what works, improve what doesn\'t.' },
      { role: 'user', content: refinementPrompt }
    ]);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const refined = JSON.parse(jsonMatch[0]);
        return {
          ...solution,
          ...refined,
          id: `${solution.id}_refined`
        };
      }
    } catch (error) {
      console.error('Failed to parse refined solution:', error);
    }

    return solution;
  }

  // Combine multiple solutions
  async combineSolutions(solutionIds: string[]): Promise<Solution> {
    const solutions: Solution[] = [];
    
    for (const history of this.solutionHistory.values()) {
      for (const solution of history.solutions) {
        if (solutionIds.includes(solution.id)) {
          solutions.push(solution);
        }
      }
    }
    
    if (solutions.length < 2) {
      throw new Error('Need at least 2 solutions to combine');
    }
    
    const combinationPrompt = `Combine these solutions into a hybrid approach:

Solutions:
${JSON.stringify(solutions, null, 2)}

Create a new solution that:
1. Takes the best aspects of each solution
2. Minimizes the drawbacks
3. Creates synergy between approaches
4. Is practical to implement

Respond with a complete solution object.`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are creating hybrid solutions. Be creative but practical.' },
      { role: 'user', content: combinationPrompt }
    ]);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const combined = JSON.parse(jsonMatch[0]);
        return {
          id: `combined_${Date.now()}`,
          approach: 'Hybrid Solution',
          ...combined,
          score: 0
        };
      }
    } catch (error) {
      throw new Error('Failed to create combined solution');
    }

    throw new Error('Could not generate combined solution');
  }

  // Export solution to implementation
  async exportToImplementation(solutionId: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    
    // Find the solution
    let solution: Solution | null = null;
    for (const history of this.solutionHistory.values()) {
      solution = history.solutions.find(s => s.id === solutionId) || null;
      if (solution) break;
    }
    
    if (!solution) {
      throw new Error('Solution not found');
    }
    
    // Generate full implementation
    const implementationPrompt = `Generate a complete implementation for this solution:

${JSON.stringify(solution, null, 2)}

Create all necessary files with proper structure.
Include:
1. Main implementation files
2. Configuration files
3. Basic tests
4. README with instructions

Respond with JSON: {"filename": "content", ...}`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are generating production-ready code. Be thorough and follow best practices.' },
      { role: 'user', content: implementationPrompt }
    ]);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const fileContents = JSON.parse(jsonMatch[0]);
        
        for (const [filename, content] of Object.entries(fileContents)) {
          files.set(filename, content as string);
        }
      }
    } catch (error) {
      // Fallback: at least create the main file
      files.set('implementation.js', solution.implementation);
      files.set('README.md', `# ${solution.approach}\n\n${solution.description}`);
    }
    
    return files;
  }

  // Get solution history
  getSolutionHistory(): CreativeResult[] {
    return Array.from(this.solutionHistory.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}