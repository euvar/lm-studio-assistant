import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { execSync } from 'child_process';

interface BackgroundTask {
  id: string;
  name: string;
  interval: number;
  lastRun?: Date;
  enabled: boolean;
  running: boolean;
}

interface AgentSuggestion {
  id: string;
  type: 'refactor' | 'performance' | 'security' | 'bestpractice' | 'test';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestion: string;
  timestamp: Date;
}

export class AutonomousAgentManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map();
  private suggestions: AgentSuggestion[] = [];
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private projectPath: string;

  constructor(projectPath: string) {
    super();
    this.projectPath = projectPath;
    this.initializeTasks();
  }

  private initializeTasks() {
    // Define background tasks
    this.registerTask({
      id: 'lint-watcher',
      name: 'Lint Error Watcher',
      interval: 30000, // 30 seconds
      enabled: true,
      running: false
    });

    this.registerTask({
      id: 'test-runner',
      name: 'Test Runner on Change',
      interval: 0, // Event-based, not interval
      enabled: true,
      running: false
    });

    this.registerTask({
      id: 'dep-updater',
      name: 'Dependency Update Checker',
      interval: 3600000, // 1 hour
      enabled: true,
      running: false
    });

    this.registerTask({
      id: 'security-scanner',
      name: 'Security Vulnerability Scanner',
      interval: 1800000, // 30 minutes
      enabled: true,
      running: false
    });

    this.registerTask({
      id: 'performance-monitor',
      name: 'Performance Issue Detector',
      interval: 300000, // 5 minutes
      enabled: true,
      running: false
    });

    this.registerTask({
      id: 'code-quality',
      name: 'Code Quality Analyzer',
      interval: 600000, // 10 minutes
      enabled: true,
      running: false
    });
  }

  private registerTask(task: BackgroundTask) {
    this.tasks.set(task.id, task);
  }

  async start() {
    for (const [id, task] of this.tasks) {
      if (task.enabled) {
        await this.startTask(id);
      }
    }
  }

  async stop() {
    for (const [id] of this.tasks) {
      await this.stopTask(id);
    }
  }

  private async startTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || task.running) return;

    task.running = true;
    this.emit('taskStarted', task);

    switch (taskId) {
      case 'lint-watcher':
        this.startLintWatcher();
        break;
      case 'test-runner':
        this.startTestWatcher();
        break;
      case 'dep-updater':
        this.startDepChecker();
        break;
      case 'security-scanner':
        this.startSecurityScanner();
        break;
      case 'performance-monitor':
        this.startPerformanceMonitor();
        break;
      case 'code-quality':
        this.startCodeQualityAnalyzer();
        break;
    }
  }

  private async stopTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || !task.running) return;

    task.running = false;
    
    // Clear interval if exists
    const interval = this.intervals.get(taskId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(taskId);
    }

    // Stop watcher if exists
    const watcher = this.watchers.get(taskId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(taskId);
    }

    this.emit('taskStopped', task);
  }

  private startLintWatcher() {
    const checkLint = async () => {
      try {
        const lintResult = execSync('npm run lint --silent', {
          cwd: this.projectPath,
          encoding: 'utf8'
        });

        const issues = this.parseLintOutput(lintResult);
        for (const issue of issues) {
          this.addSuggestion({
            type: 'bestpractice',
            priority: 'medium',
            title: 'Lint Error Found',
            description: issue.message,
            file: issue.file,
            line: issue.line,
            suggestion: 'Fix the lint error to improve code quality'
          });
        }
      } catch (error: any) {
        // Lint errors are in stderr
        if (error.stdout || error.stderr) {
          const issues = this.parseLintOutput(error.stdout + error.stderr);
          for (const issue of issues) {
            this.addSuggestion({
              type: 'bestpractice',
              priority: 'medium',
              title: 'Lint Error',
              description: issue.message,
              file: issue.file,
              line: issue.line,
              suggestion: 'Run `npm run lint:fix` to automatically fix some issues'
            });
          }
        }
      }
    };

    // Run immediately and then on interval
    checkLint();
    const interval = setInterval(checkLint, 30000);
    this.intervals.set('lint-watcher', interval);
  }

  private startTestWatcher() {
    const watcher = chokidar.watch(['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'], {
      cwd: this.projectPath,
      ignored: ['node_modules/**', 'dist/**'],
      persistent: true
    });

    watcher.on('change', async (filePath) => {
      this.emit('testFileChanged', filePath);
      
      try {
        const result = execSync(`npm test -- ${filePath}`, {
          cwd: this.projectPath,
          encoding: 'utf8'
        });

        if (result.includes('FAIL')) {
          this.addSuggestion({
            type: 'test',
            priority: 'high',
            title: 'Test Failure',
            description: `Tests in ${filePath} are failing`,
            file: filePath,
            suggestion: 'Fix the failing tests or update them to match new behavior'
          });
        }
      } catch (error) {
        // Test failure
        this.addSuggestion({
          type: 'test',
          priority: 'high',
          title: 'Test Execution Error',
          description: `Failed to run tests in ${filePath}`,
          file: filePath,
          suggestion: 'Check test syntax and dependencies'
        });
      }
    });

    this.watchers.set('test-runner', watcher);
  }

  private startDepChecker() {
    const checkDeps = async () => {
      try {
        const result = execSync('npm outdated --json', {
          cwd: this.projectPath,
          encoding: 'utf8'
        });

        if (result) {
          const outdated = JSON.parse(result);
          const criticalUpdates = Object.entries(outdated).filter(([, info]: [string, any]) => {
            const current = info.current.split('.');
            const latest = info.latest.split('.');
            return current[0] !== latest[0]; // Major version change
          });

          if (criticalUpdates.length > 0) {
            this.addSuggestion({
              type: 'security',
              priority: 'medium',
              title: 'Major Dependency Updates Available',
              description: `${criticalUpdates.length} packages have major updates`,
              suggestion: `Review and update: ${criticalUpdates.map(([name]) => name).join(', ')}`
            });
          }
        }
      } catch (error) {
        // npm outdated returns non-zero exit code when outdated packages exist
        // This is expected behavior
      }
    };

    checkDeps();
    const interval = setInterval(checkDeps, 3600000);
    this.intervals.set('dep-updater', interval);
  }

  private startSecurityScanner() {
    const scanSecurity = async () => {
      try {
        const result = execSync('npm audit --json', {
          cwd: this.projectPath,
          encoding: 'utf8'
        });

        const audit = JSON.parse(result);
        if (audit.metadata.vulnerabilities.total > 0) {
          const { high, critical } = audit.metadata.vulnerabilities;
          
          if (critical > 0 || high > 0) {
            this.addSuggestion({
              type: 'security',
              priority: 'high',
              title: 'Security Vulnerabilities Found',
              description: `${critical} critical, ${high} high severity vulnerabilities`,
              suggestion: 'Run `npm audit fix` or update vulnerable packages manually'
            });
          }
        }
      } catch (error) {
        // npm audit might fail, ignore for now
      }
    };

    scanSecurity();
    const interval = setInterval(scanSecurity, 1800000);
    this.intervals.set('security-scanner', interval);
  }

  private startPerformanceMonitor() {
    const checkPerformance = async () => {
      // Monitor for common performance issues
      const jsFiles = await this.findFiles('**/*.{js,ts}', ['node_modules', 'dist']);
      
      for (const file of jsFiles) {
        try {
          const content = await fs.readFile(path.join(this.projectPath, file), 'utf-8');
          
          // Check for performance anti-patterns
          const issues: Array<{pattern: RegExp, message: string}> = [
            {
              pattern: /\.forEach\([^)]*\)\.forEach/g,
              message: 'Nested forEach loops detected'
            },
            {
              pattern: /JSON\.parse\(JSON\.stringify/g,
              message: 'Inefficient deep clone pattern'
            },
            {
              pattern: /document\.querySelector.*inside.*loop/gi,
              message: 'DOM query inside loop'
            }
          ];

          for (const {pattern, message} of issues) {
            if (pattern.test(content)) {
              this.addSuggestion({
                type: 'performance',
                priority: 'medium',
                title: 'Performance Issue',
                description: message,
                file,
                suggestion: 'Refactor to improve performance'
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    };

    checkPerformance();
    const interval = setInterval(checkPerformance, 300000);
    this.intervals.set('performance-monitor', interval);
  }

  private startCodeQualityAnalyzer() {
    const analyzeQuality = async () => {
      const jsFiles = await this.findFiles('**/*.{js,ts}', ['node_modules', 'dist', 'test']);
      
      for (const file of jsFiles) {
        try {
          const content = await fs.readFile(path.join(this.projectPath, file), 'utf-8');
          const lines = content.split('\n');
          
          // Check file length
          if (lines.length > 300) {
            this.addSuggestion({
              type: 'refactor',
              priority: 'low',
              title: 'Large File',
              description: `File has ${lines.length} lines`,
              file,
              suggestion: 'Consider splitting into smaller modules'
            });
          }

          // Check function complexity
          const functionMatches = content.match(/function\s+\w+\s*\([^)]*\)\s*{|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*{/g);
          if (functionMatches && functionMatches.length > 15) {
            this.addSuggestion({
              type: 'refactor',
              priority: 'medium',
              title: 'Too Many Functions',
              description: `File contains ${functionMatches.length} functions`,
              file,
              suggestion: 'Consider organizing functions into classes or separate modules'
            });
          }

          // Check for TODO comments
          const todoMatches = content.match(/\/\/\s*TODO|\/\*\s*TODO/gi);
          if (todoMatches && todoMatches.length > 3) {
            this.addSuggestion({
              type: 'bestpractice',
              priority: 'low',
              title: 'Multiple TODOs',
              description: `Found ${todoMatches.length} TODO comments`,
              file,
              suggestion: 'Address TODO items or create issues to track them'
            });
          }
        } catch (error) {
          // Skip files that can't be analyzed
        }
      }
    };

    analyzeQuality();
    const interval = setInterval(analyzeQuality, 600000);
    this.intervals.set('code-quality', interval);
  }

  private parseLintOutput(output: string): Array<{message: string, file: string, line: number}> {
    const issues: Array<{message: string, file: string, line: number}> = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse ESLint output format
      const match = line.match(/^\s*(\S+):(\d+):(\d+)\s+error\s+(.+)/);
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2]),
          message: match[4]
        });
      }
    }
    
    return issues;
  }

  private async findFiles(pattern: string, ignore: string[]): Promise<string[]> {
    // Simple file finder implementation
    const globby = await import('globby');
    return globby.globby(pattern, {
      cwd: this.projectPath,
      ignore
    });
  }

  private addSuggestion(params: Omit<AgentSuggestion, 'id' | 'timestamp'>) {
    const suggestion: AgentSuggestion = {
      id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date(),
      ...params
    };

    // Check if similar suggestion already exists
    const exists = this.suggestions.some(s => 
      s.type === suggestion.type && 
      s.file === suggestion.file && 
      s.description === suggestion.description
    );

    if (!exists) {
      this.suggestions.push(suggestion);
      this.emit('suggestionAdded', suggestion);

      // Keep only recent suggestions
      if (this.suggestions.length > 100) {
        this.suggestions = this.suggestions.slice(-50);
      }
    }
  }

  getSuggestions(type?: AgentSuggestion['type']): AgentSuggestion[] {
    if (type) {
      return this.suggestions.filter(s => s.type === type);
    }
    return [...this.suggestions];
  }

  getRecentSuggestions(count: number = 10): AgentSuggestion[] {
    return this.suggestions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, count);
  }

  dismissSuggestion(id: string) {
    this.suggestions = this.suggestions.filter(s => s.id !== id);
    this.emit('suggestionDismissed', id);
  }

  getTaskStatus(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  enableTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task && !task.enabled) {
      task.enabled = true;
      if (!task.running) {
        this.startTask(taskId);
      }
    }
  }

  disableTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task && task.enabled) {
      task.enabled = false;
      if (task.running) {
        this.stopTask(taskId);
      }
    }
  }

  getStats() {
    return {
      activeTasks: Array.from(this.tasks.values()).filter(t => t.running).length,
      totalSuggestions: this.suggestions.length,
      suggestionsByType: this.suggestions.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      suggestionsByPriority: this.suggestions.reduce((acc, s) => {
        acc[s.priority] = (acc[s.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}