import { Tool, ToolResult } from './base.js';
import { AICodeReview } from '../core/ai-code-review.js';
import { CodeIntelligence } from '../core/code-intelligence.js';
import * as fs from 'fs/promises';

export class CodeReviewTool implements Tool {
  name = 'codeReview';
  description = 'Perform AI-powered code review on files or directories';
  
  parameters = {
    paths: {
      type: 'array' as const,
      description: 'File paths or directories to review',
      required: true
    },
    gitChanges: {
      type: 'boolean' as const,
      description: 'Review only git changes (uncommitted)',
      default: false
    },
    baseBranch: {
      type: 'string' as const,
      description: 'Base branch for git diff (default: main)',
      default: 'main'
    },
    autoFix: {
      type: 'boolean' as const,
      description: 'Automatically fix issues where possible',
      default: false
    },
    categories: {
      type: 'array' as const,
      description: 'Specific categories to check (e.g., security, performance)',
      default: []
    }
  };

  private codeIntelligence: CodeIntelligence;
  private aiReview: AICodeReview;

  constructor() {
    this.codeIntelligence = new CodeIntelligence();
    this.aiReview = new AICodeReview(this.codeIntelligence);
  }

  async execute(params: any): Promise<ToolResult> {
    const { paths = [], gitChanges = false, baseBranch = 'main', autoFix = false, categories = [] } = params;

    try {
      let report;
      
      if (gitChanges) {
        // Review git changes
        report = await this.aiReview.reviewGitChanges(baseBranch);
      } else if (paths.length > 0) {
        // Review specified paths
        report = await this.aiReview.review(paths);
      } else {
        // Default to current directory
        report = await this.aiReview.review(['.']);
      }

      // Filter by categories if specified
      if (categories.length > 0) {
        report.comments = report.comments.filter(comment => 
          categories.includes(comment.category)
        );
        
        // Recalculate stats
        report.issues = report.comments.length;
        report.breakdown = {
          errors: report.comments.filter(c => c.severity === 'error').length,
          warnings: report.comments.filter(c => c.severity === 'warning').length,
          suggestions: report.comments.filter(c => c.severity === 'suggestion').length,
          info: report.comments.filter(c => c.severity === 'info').length
        };
      }

      // Apply auto-fixes if requested
      let fixedFiles: string[] = [];
      if (autoFix && report.comments.length > 0) {
        const fixes = await this.aiReview.autoFix(report);
        
        for (const [file, content] of fixes) {
          await fs.writeFile(file, content);
          fixedFiles.push(file);
        }
      }

      // Format the report
      const formattedReport = this.aiReview.formatReport(report);

      const result = {
        report,
        formattedReport,
        fixedFiles,
        summary: {
          score: report.score,
          files: report.files,
          issues: report.issues,
          breakdown: report.breakdown,
          topIssues: this.getTopIssues(report)
        }
      };

      return {
        success: true,
        data: result
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Code review failed: ${error.message}`
      };
    }
  }

  private getTopIssues(report: any): any[] {
    const issueCounts = new Map<string, number>();
    
    for (const comment of report.comments) {
      const key = `${comment.severity}:${comment.message}`;
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
    }

    return Array.from(issueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue, count]) => {
        const [severity, message] = issue.split(':');
        return { severity, message, count };
      });
  }
}

export class GitReviewTool implements Tool {
  name = 'gitReview';
  description = 'Review git commits, pull requests, or branches';
  
  parameters = {
    type: {
      type: 'string' as const,
      description: 'Type of review: commit, pr, branch',
      required: true
    },
    target: {
      type: 'string' as const,
      description: 'Target to review (commit hash, PR number, branch name)',
      required: true
    },
    baseBranch: {
      type: 'string' as const,
      description: 'Base branch for comparison',
      default: 'main'
    },
    includeTests: {
      type: 'boolean' as const,
      description: 'Include test coverage analysis',
      default: true
    }
  };

  private reviewTool: CodeReviewTool;

  constructor() {
    this.reviewTool = new CodeReviewTool();
  }

  async execute(params: any): Promise<ToolResult> {
    const { type, target, baseBranch = 'main', includeTests = true } = params;

    try {
      let reviewParams: any = {
        gitChanges: true,
        baseBranch
      };

      // Handle different review types
      switch (type) {
        case 'commit':
          // Review a specific commit
          reviewParams.baseBranch = `${target}^`;
          break;
          
        case 'pr':
          // Review a pull request (would need GitHub API integration)
          return {
            success: false,
            error: 'PR review requires GitHub integration (not yet implemented)'
          };
          
        case 'branch':
          // Review entire branch
          reviewParams.baseBranch = baseBranch;
          break;
          
        default:
          return {
            success: false,
            error: `Unknown review type: ${type}`
          };
      }

      // Execute the review
      const result = await this.reviewTool.execute(reviewParams);

      if (!result.success) {
        return result;
      }

      // Add test coverage analysis if requested
      if (includeTests) {
        const testAnalysis = await this.analyzeTestCoverage(target);
        result.data.testCoverage = testAnalysis;
      }

      return result;

    } catch (error: any) {
      return {
        success: false,
        error: `Git review failed: ${error.message}`
      };
    }
  }

  private async analyzeTestCoverage(target: string): Promise<any> {
    // This would integrate with test coverage tools
    // For now, return a placeholder
    return {
      overall: 'N/A',
      files: [],
      suggestion: 'Consider running tests with coverage enabled'
    };
  }
}