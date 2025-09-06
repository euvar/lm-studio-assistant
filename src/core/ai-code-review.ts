import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as diff from 'diff';
import { CodeIntelligence } from './code-intelligence.js';

const execAsync = promisify(exec);

interface ReviewComment {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'suggestion' | 'info';
  message: string;
  suggestion?: string;
  category: ReviewCategory;
}

enum ReviewCategory {
  BestPractices = 'best-practices',
  Performance = 'performance',
  Security = 'security',
  Maintainability = 'maintainability',
  Testing = 'testing',
  Documentation = 'documentation',
  CodeStyle = 'code-style',
  Accessibility = 'accessibility',
  TypeSafety = 'type-safety'
}

interface ReviewRules {
  [key: string]: ReviewRule;
}

interface ReviewRule {
  category: ReviewCategory;
  severity: ReviewComment['severity'];
  pattern?: RegExp;
  check: (content: string, file: string) => ReviewComment[];
}

interface ReviewReport {
  files: number;
  issues: number;
  breakdown: {
    errors: number;
    warnings: number;
    suggestions: number;
    info: number;
  };
  categories: Map<ReviewCategory, number>;
  comments: ReviewComment[];
  score: number;
  summary: string;
}

export class AICodeReview extends EventEmitter {
  private codeIntelligence: CodeIntelligence;
  private rules: ReviewRules = {};
  private customRules: ReviewRules = {};
  
  constructor(codeIntelligence: CodeIntelligence) {
    super();
    this.codeIntelligence = codeIntelligence;
    this.initializeDefaultRules();
  }

  private initializeDefaultRules() {
    // Security rules
    this.rules['no-eval'] = {
      category: ReviewCategory.Security,
      severity: 'error',
      pattern: /\beval\s*\(/,
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (this.rules['no-eval'].pattern!.test(line)) {
            comments.push({
              file,
              line: index + 1,
              severity: 'error',
              message: 'Avoid using eval() as it can execute arbitrary code',
              suggestion: 'Use JSON.parse() for parsing JSON or Function constructor for dynamic code',
              category: ReviewCategory.Security
            });
          }
        });
        
        return comments;
      }
    };

    // Performance rules
    this.rules['avoid-nested-loops'] = {
      category: ReviewCategory.Performance,
      severity: 'warning',
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        const lines = content.split('\n');
        let loopDepth = 0;
        
        lines.forEach((line, index) => {
          if (/\b(for|while)\s*\(/.test(line)) {
            loopDepth++;
            if (loopDepth >= 3) {
              comments.push({
                file,
                line: index + 1,
                severity: 'warning',
                message: 'Deep nesting of loops can impact performance',
                suggestion: 'Consider refactoring to reduce nesting or use more efficient algorithms',
                category: ReviewCategory.Performance
              });
            }
          }
          if (line.includes('}')) {
            loopDepth = Math.max(0, loopDepth - 1);
          }
        });
        
        return comments;
      }
    };

    // Best practices
    this.rules['no-console'] = {
      category: ReviewCategory.BestPractices,
      severity: 'warning',
      pattern: /console\.(log|error|warn|info)/,
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (this.rules['no-console'].pattern!.test(line) && !line.trim().startsWith('//')) {
            comments.push({
              file,
              line: index + 1,
              severity: 'warning',
              message: 'Remove console statements from production code',
              suggestion: 'Use a proper logging library or remove debug statements',
              category: ReviewCategory.BestPractices
            });
          }
        });
        
        return comments;
      }
    };

    // Type safety
    this.rules['no-any-type'] = {
      category: ReviewCategory.TypeSafety,
      severity: 'warning',
      pattern: /:\s*any\b/,
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return comments;
        
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (this.rules['no-any-type'].pattern!.test(line)) {
            comments.push({
              file,
              line: index + 1,
              severity: 'warning',
              message: 'Avoid using "any" type',
              suggestion: 'Use a more specific type or unknown if the type is truly unknown',
              category: ReviewCategory.TypeSafety
            });
          }
        });
        
        return comments;
      }
    };

    // Documentation
    this.rules['missing-jsdoc'] = {
      category: ReviewCategory.Documentation,
      severity: 'suggestion',
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          // Check for exported functions without JSDoc
          if (/^export\s+(async\s+)?function\s+\w+/.test(line.trim())) {
            if (index === 0 || !lines[index - 1].trim().endsWith('*/')) {
              comments.push({
                file,
                line: index + 1,
                severity: 'suggestion',
                message: 'Exported function should have JSDoc documentation',
                suggestion: 'Add JSDoc comment describing the function, parameters, and return value',
                category: ReviewCategory.Documentation
              });
            }
          }
        });
        
        return comments;
      }
    };

    // Testing
    this.rules['missing-tests'] = {
      category: ReviewCategory.Testing,
      severity: 'info',
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        
        // Check if this is a source file that should have tests
        if ((file.endsWith('.ts') || file.endsWith('.js')) && 
            !file.includes('.test.') && 
            !file.includes('.spec.') &&
            !file.includes('test/') &&
            !file.includes('__tests__/')) {
          
          // Check if corresponding test file exists
          const testFile = file.replace(/\.(ts|js)$/, '.test.$1');
          const specFile = file.replace(/\.(ts|js)$/, '.spec.$1');
          
          comments.push({
            file,
            line: 1,
            severity: 'info',
            message: 'Consider adding tests for this file',
            suggestion: `Create ${path.basename(testFile)} or ${path.basename(specFile)}`,
            category: ReviewCategory.Testing
          });
        }
        
        return comments;
      }
    };

    // Accessibility (for React/HTML)
    this.rules['missing-alt-text'] = {
      category: ReviewCategory.Accessibility,
      severity: 'error',
      pattern: /<img(?![^>]*\balt\s*=)[^>]*>/i,
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        if (!file.endsWith('.tsx') && !file.endsWith('.jsx') && !file.endsWith('.html')) {
          return comments;
        }
        
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (this.rules['missing-alt-text'].pattern!.test(line)) {
            comments.push({
              file,
              line: index + 1,
              severity: 'error',
              message: 'Images must have alt text for accessibility',
              suggestion: 'Add alt="" for decorative images or descriptive alt text for informative images',
              category: ReviewCategory.Accessibility
            });
          }
        });
        
        return comments;
      }
    };

    // Code complexity
    this.rules['complex-function'] = {
      category: ReviewCategory.Maintainability,
      severity: 'warning',
      check: (content, file) => {
        const comments: ReviewComment[] = [];
        const lines = content.split('\n');
        let functionStart = -1;
        let braceCount = 0;
        
        lines.forEach((line, index) => {
          if (/function\s+\w+|=>\s*{/.test(line)) {
            functionStart = index;
            braceCount = 0;
          }
          
          if (functionStart >= 0) {
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;
            
            if (braceCount === 0 && functionStart >= 0) {
              const functionLength = index - functionStart + 1;
              if (functionLength > 50) {
                comments.push({
                  file,
                  line: functionStart + 1,
                  severity: 'warning',
                  message: `Function is ${functionLength} lines long, consider breaking it down`,
                  suggestion: 'Extract logic into smaller, focused functions',
                  category: ReviewCategory.Maintainability
                });
              }
              functionStart = -1;
            }
          }
        });
        
        return comments;
      }
    };
  }

  // Add custom rule
  addRule(name: string, rule: ReviewRule) {
    this.customRules[name] = rule;
  }

  // Review a single file
  async reviewFile(filePath: string): Promise<ReviewComment[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const comments: ReviewComment[] = [];
      
      // Apply all rules
      const allRules = { ...this.rules, ...this.customRules };
      for (const [ruleName, rule] of Object.entries(allRules)) {
        const ruleComments = rule.check(content, filePath);
        comments.push(...ruleComments);
      }
      
      // Use code intelligence for more advanced checks
      await this.codeIntelligence.analyzeFile(filePath);
      const issues = this.codeIntelligence.detectIssues();
      
      // Convert CodeIntelligence issues to ReviewComments
      for (const issue of issues) {
        if (issue.file === filePath) {
          comments.push({
            file: issue.file,
            line: issue.line,
            severity: issue.type === 'error' ? 'error' : issue.type === 'warning' ? 'warning' : 'suggestion',
            message: issue.message,
            suggestion: issue.suggestion,
            category: ReviewCategory.CodeStyle
          });
        }
      }
      
      return comments;
    } catch (error) {
      console.error(`Error reviewing file ${filePath}:`, error);
      return [];
    }
  }

  // Review multiple files or a directory
  async review(paths: string[]): Promise<ReviewReport> {
    const allComments: ReviewComment[] = [];
    const reviewedFiles = new Set<string>();
    
    for (const p of paths) {
      const stat = await fs.stat(p);
      
      if (stat.isDirectory()) {
        // Get all files in directory
        const files = await this.getFilesRecursively(p);
        for (const file of files) {
          if (this.shouldReviewFile(file)) {
            const comments = await this.reviewFile(file);
            allComments.push(...comments);
            reviewedFiles.add(file);
          }
        }
      } else if (stat.isFile() && this.shouldReviewFile(p)) {
        const comments = await this.reviewFile(p);
        allComments.push(...comments);
        reviewedFiles.add(p);
      }
    }
    
    // Generate report
    const report = this.generateReport(Array.from(reviewedFiles), allComments);
    
    return report;
  }

  // Review git changes
  async reviewGitChanges(baseBranch: string = 'main'): Promise<ReviewReport> {
    try {
      // Get list of changed files
      const { stdout } = await execAsync(`git diff --name-only ${baseBranch}...HEAD`);
      const changedFiles = stdout.trim().split('\n').filter(f => f && this.shouldReviewFile(f));
      
      const allComments: ReviewComment[] = [];
      
      for (const file of changedFiles) {
        // Get the diff for each file
        const { stdout: diffContent } = await execAsync(`git diff ${baseBranch}...HEAD -- "${file}"`);
        
        // Review the current version
        const comments = await this.reviewFile(file);
        
        // Filter comments to only changed lines
        const relevantComments = this.filterCommentsForDiff(comments, diffContent);
        allComments.push(...relevantComments);
      }
      
      return this.generateReport(changedFiles, allComments);
    } catch (error) {
      console.error('Error reviewing git changes:', error);
      return this.generateReport([], []);
    }
  }

  // Filter comments to only include those on changed lines
  private filterCommentsForDiff(comments: ReviewComment[], diffContent: string): ReviewComment[] {
    const changedLines = new Set<number>();
    const lines = diffContent.split('\n');
    let currentLine = 0;
    
    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+,?\d* \+(\d+),?(\d*) @@/);
        if (match) {
          currentLine = parseInt(match[1]) - 1;
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        changedLines.add(currentLine);
        currentLine++;
      } else if (!line.startsWith('-')) {
        currentLine++;
      }
    }
    
    return comments.filter(comment => changedLines.has(comment.line));
  }

  // Generate review report
  private generateReport(files: string[], comments: ReviewComment[]): ReviewReport {
    const breakdown = {
      errors: comments.filter(c => c.severity === 'error').length,
      warnings: comments.filter(c => c.severity === 'warning').length,
      suggestions: comments.filter(c => c.severity === 'suggestion').length,
      info: comments.filter(c => c.severity === 'info').length
    };
    
    const categories = new Map<ReviewCategory, number>();
    for (const comment of comments) {
      categories.set(comment.category, (categories.get(comment.category) || 0) + 1);
    }
    
    // Calculate score (0-100)
    const score = Math.max(0, 100 - (breakdown.errors * 10) - (breakdown.warnings * 5) - (breakdown.suggestions * 2));
    
    // Generate summary
    let summary = `Reviewed ${files.length} file${files.length !== 1 ? 's' : ''} and found ${comments.length} issue${comments.length !== 1 ? 's' : ''}.`;
    
    if (score >= 90) {
      summary += ' Excellent code quality!';
    } else if (score >= 70) {
      summary += ' Good code quality with room for improvement.';
    } else if (score >= 50) {
      summary += ' Code needs attention to address quality issues.';
    } else {
      summary += ' Significant improvements needed.';
    }
    
    return {
      files: files.length,
      issues: comments.length,
      breakdown,
      categories,
      comments: comments.sort((a, b) => {
        // Sort by severity, then by file, then by line
        const severityOrder = { error: 0, warning: 1, suggestion: 2, info: 3 };
        if (a.severity !== b.severity) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        if (a.file !== b.file) {
          return a.file.localeCompare(b.file);
        }
        return a.line - b.line;
      }),
      score,
      summary
    };
  }

  // Check if file should be reviewed
  private shouldReviewFile(file: string): boolean {
    const reviewableExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.cs'];
    const excludePatterns = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor'];
    
    const ext = path.extname(file).toLowerCase();
    const shouldReview = reviewableExtensions.includes(ext);
    const shouldExclude = excludePatterns.some(pattern => file.includes(pattern));
    
    return shouldReview && !shouldExclude;
  }

  // Get all files recursively
  private async getFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.getFilesRecursively(fullPath));
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  // Format report for display
  formatReport(report: ReviewReport): string {
    const lines: string[] = [];
    
    lines.push('');
    lines.push('=== AI Code Review Report ===');
    lines.push('');
    lines.push(report.summary);
    lines.push('');
    lines.push(`Score: ${report.score}/100`);
    lines.push('');
    lines.push('Breakdown:');
    lines.push(`  Errors:      ${report.breakdown.errors}`);
    lines.push(`  Warnings:    ${report.breakdown.warnings}`);
    lines.push(`  Suggestions: ${report.breakdown.suggestions}`);
    lines.push(`  Info:        ${report.breakdown.info}`);
    lines.push('');
    
    if (report.categories.size > 0) {
      lines.push('By Category:');
      for (const [category, count] of report.categories) {
        lines.push(`  ${category}: ${count}`);
      }
      lines.push('');
    }
    
    if (report.comments.length > 0) {
      lines.push('Issues:');
      lines.push('');
      
      let currentFile = '';
      for (const comment of report.comments) {
        if (comment.file !== currentFile) {
          currentFile = comment.file;
          lines.push(`\n${currentFile}:`);
        }
        
        const icon = {
          error: '❌',
          warning: '⚠️',
          suggestion: '💡',
          info: 'ℹ️'
        }[comment.severity];
        
        lines.push(`  ${icon} Line ${comment.line}: ${comment.message}`);
        if (comment.suggestion) {
          lines.push(`     → ${comment.suggestion}`);
        }
      }
    }
    
    return lines.join('\n');
  }

  // Auto-fix certain issues
  async autoFix(report: ReviewReport): Promise<Map<string, string>> {
    const fixes = new Map<string, string>();
    const fileContents = new Map<string, string[]>();
    
    // Group comments by file
    const commentsByFile = new Map<string, ReviewComment[]>();
    for (const comment of report.comments) {
      if (!commentsByFile.has(comment.file)) {
        commentsByFile.set(comment.file, []);
      }
      commentsByFile.get(comment.file)!.push(comment);
    }
    
    // Apply fixes for each file
    for (const [file, comments] of commentsByFile) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        fileContents.set(file, [...lines]);
        
        // Sort comments by line number in reverse order to avoid offset issues
        const sortedComments = comments.sort((a, b) => b.line - a.line);
        
        for (const comment of sortedComments) {
          // Auto-fix based on comment type
          if (comment.severity === 'error' || comment.severity === 'warning') {
            const fixedLine = this.applyAutoFix(lines[comment.line - 1], comment);
            if (fixedLine !== null) {
              lines[comment.line - 1] = fixedLine;
            }
          }
        }
        
        const fixedContent = lines.join('\n');
        if (fixedContent !== content) {
          fixes.set(file, fixedContent);
        }
      } catch (error) {
        console.error(`Error auto-fixing ${file}:`, error);
      }
    }
    
    return fixes;
  }

  // Apply specific auto-fix
  private applyAutoFix(line: string, comment: ReviewComment): string | null {
    // Remove console statements
    if (comment.message.includes('console statements')) {
      return line.replace(/console\.(log|error|warn|info)\([^)]*\);?/, '// TODO: Remove debug statement');
    }
    
    // Replace any with unknown
    if (comment.message.includes('"any" type')) {
      return line.replace(/:\s*any\b/, ': unknown');
    }
    
    // Add alt text placeholder
    if (comment.message.includes('alt text')) {
      return line.replace(/<img\s+/, '<img alt="" ');
    }
    
    return null;
  }
}