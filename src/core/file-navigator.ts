import path from 'path';
import os from 'os';

export interface NavigationContext {
  currentPath: string;
  history: string[];
}

export class FileNavigator {
  private context: NavigationContext;

  constructor(initialPath: string = process.cwd()) {
    this.context = {
      currentPath: path.resolve(initialPath),
      history: [path.resolve(initialPath)]
    };
  }

  /**
   * Parse natural language file navigation requests
   */
  parseNavigationIntent(input: string): { action: string; target?: string } {
    const lowerInput = input.toLowerCase();
    
    // Navigation patterns
    const patterns = [
      // Russian patterns
      { regex: /покажи.*папк[уи].*выше|наверх|вверх/i, action: 'up' },
      { regex: /перейди.*папк[уи].*выше|поднимись|назад/i, action: 'up' },
      { regex: /покажи.*родительск/i, action: 'up' },
      { regex: /покажи.*файлы.*(?:в|внутри)\s+(.+)/i, action: 'navigate', capture: 1 },
      { regex: /перейди.*(?:в|к)\s+(.+)/i, action: 'navigate', capture: 1 },
      { regex: /открой.*папк[уи]\s+(.+)/i, action: 'navigate', capture: 1 },
      { regex: /где.*я|текущ.*папк|pwd/i, action: 'pwd' },
      { regex: /домашн.*папк|home/i, action: 'home' },
      { regex: /корен|root/i, action: 'root' },
      
      // English patterns
      { regex: /show.*parent|go.*up|\.\.\/|up.*folder/i, action: 'up' },
      { regex: /show.*files.*in\s+(.+)/i, action: 'navigate', capture: 1 },
      { regex: /go.*to\s+(.+)/i, action: 'navigate', capture: 1 },
      { regex: /open.*folder\s+(.+)/i, action: 'navigate', capture: 1 },
      { regex: /where.*am.*i|current.*dir|pwd/i, action: 'pwd' },
      { regex: /home.*dir/i, action: 'home' },
      
      // Default file listing
      { regex: /покажи.*файл|list.*file|показать.*содержим|ls/i, action: 'list' },
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern.regex);
      if (match) {
        if (pattern.capture && match[pattern.capture]) {
          return { action: pattern.action, target: match[pattern.capture].trim() };
        }
        return { action: pattern.action };
      }
    }
    
    // Default to list
    return { action: 'list' };
  }

  /**
   * Resolve navigation target to absolute path
   */
  resolvePath(target?: string): string {
    if (!target) return this.context.currentPath;
    
    // Handle special targets
    if (target === '~' || target === 'home') {
      return os.homedir();
    }
    
    if (target === '/') {
      return '/';
    }
    
    // Handle relative paths
    if (target.startsWith('..')) {
      return path.resolve(this.context.currentPath, target);
    }
    
    // Check if absolute path
    if (path.isAbsolute(target)) {
      return path.resolve(target);
    }
    
    // Relative to current path
    return path.resolve(this.context.currentPath, target);
  }

  /**
   * Navigate based on action
   */
  navigate(action: string, target?: string): string {
    switch (action) {
      case 'up':
        this.context.currentPath = path.dirname(this.context.currentPath);
        break;
        
      case 'home':
        this.context.currentPath = os.homedir();
        break;
        
      case 'root':
        this.context.currentPath = path.parse(this.context.currentPath).root;
        break;
        
      case 'navigate':
        if (target) {
          this.context.currentPath = this.resolvePath(target);
        }
        break;
        
      case 'pwd':
        // Just return current path
        break;
        
      case 'list':
      default:
        // Stay in current directory
        break;
    }
    
    // Add to history if changed
    const lastPath = this.context.history[this.context.history.length - 1];
    if (this.context.currentPath !== lastPath) {
      this.context.history.push(this.context.currentPath);
      // Keep only last 10 entries
      if (this.context.history.length > 10) {
        this.context.history.shift();
      }
    }
    
    return this.context.currentPath;
  }

  getCurrentPath(): string {
    return this.context.currentPath;
  }

  getHistory(): string[] {
    return [...this.context.history];
  }

  /**
   * Get breadcrumb navigation
   */
  getBreadcrumb(): string[] {
    const parts = this.context.currentPath.split(path.sep).filter(p => p);
    if (process.platform === 'win32') {
      // Windows: C:\Users\... -> ['C:', 'Users', ...]
      return parts;
    } else {
      // Unix: /home/user/... -> ['/', 'home', 'user', ...]
      return ['/', ...parts];
    }
  }

  /**
   * Format current location for display
   */
  formatLocation(): string {
    const home = os.homedir();
    const current = this.context.currentPath;
    
    // Replace home directory with ~
    if (current.startsWith(home)) {
      return '~' + current.slice(home.length);
    }
    
    return current;
  }
}