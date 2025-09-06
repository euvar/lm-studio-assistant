import { EventEmitter } from 'events';
import chalk from 'chalk';
import * as readline from 'readline';

interface MinimapRegion {
  startLine: number;
  endLine: number;
  label: string;
  type: 'function' | 'class' | 'section' | 'comment' | 'import';
  level: number;
}

export class MinimapNavigation extends EventEmitter {
  private fileContent: string[] = [];
  private regions: MinimapRegion[] = [];
  private currentLine: number = 0;
  private viewportHeight: number = 30;
  private minimapWidth: number = 20;
  private isActive: boolean = false;

  constructor() {
    super();
  }

  async initialize(content: string) {
    this.fileContent = content.split('\n');
    this.regions = this.analyzeContent();
    this.currentLine = 0;
  }

  private analyzeContent(): MinimapRegion[] {
    const regions: MinimapRegion[] = [];
    const lines = this.fileContent;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect functions
      const functionMatch = trimmed.match(/^(async\s+)?function\s+(\w+)|^(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\(|^(\w+)\s*\(/);
      if (functionMatch) {
        const name = functionMatch[2] || functionMatch[4] || functionMatch[6] || 'anonymous';
        regions.push({
          startLine: i,
          endLine: this.findEndOfBlock(i),
          label: `ƒ ${name}`,
          type: 'function',
          level: this.getIndentLevel(line)
        });
      }

      // Detect classes
      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        regions.push({
          startLine: i,
          endLine: this.findEndOfBlock(i),
          label: `◆ ${classMatch[1]}`,
          type: 'class',
          level: this.getIndentLevel(line)
        });
      }

      // Detect section comments
      const sectionMatch = trimmed.match(/^\/\/\s*#+\s*(.+)|^\/\*+\s*(.+)\s*\*+\//);
      if (sectionMatch) {
        regions.push({
          startLine: i,
          endLine: i,
          label: `§ ${sectionMatch[1] || sectionMatch[2]}`,
          type: 'section',
          level: 0
        });
      }

      // Detect imports
      if (trimmed.startsWith('import ') && i < 20) {
        if (regions.length === 0 || regions[0].type !== 'import') {
          regions.unshift({
            startLine: 0,
            endLine: i,
            label: '⬇ Imports',
            type: 'import',
            level: 0
          });
        } else {
          regions[0].endLine = i;
        }
      }
    }

    return regions.sort((a, b) => a.startLine - b.startLine);
  }

  private findEndOfBlock(startLine: number): number {
    let braceCount = 0;
    let inBlock = false;

    for (let i = startLine; i < this.fileContent.length; i++) {
      const line = this.fileContent[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inBlock = true;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && inBlock) {
            return i;
          }
        }
      }
    }

    return Math.min(startLine + 10, this.fileContent.length - 1);
  }

  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? Math.floor(match[1].length / 2) : 0;
  }

  display() {
    console.clear();
    const viewportStart = Math.max(0, this.currentLine - Math.floor(this.viewportHeight / 2));
    const viewportEnd = Math.min(this.fileContent.length, viewportStart + this.viewportHeight);

    // Build minimap
    const minimap = this.buildMinimap(viewportStart, viewportEnd);
    
    // Display side by side
    console.log(chalk.bold.cyan('File Navigator - Minimap Mode'));
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 80)));
    
    for (let i = 0; i < this.viewportHeight; i++) {
      const lineIdx = viewportStart + i;
      const codeLine = lineIdx < this.fileContent.length ? this.fileContent[lineIdx] : '';
      const minimapLine = minimap[i] || '';
      
      // Highlight current line
      const isCurrentLine = lineIdx === this.currentLine;
      const lineNumber = String(lineIdx + 1).padStart(4, ' ');
      
      const codeDisplay = isCurrentLine 
        ? chalk.bgBlue.white(`${lineNumber} │ ${codeLine}`)
        : chalk.gray(`${lineNumber} │`) + ' ' + this.syntaxHighlight(codeLine);
      
      // Truncate code to fit
      const maxCodeWidth = (process.stdout.columns || 80) - this.minimapWidth - 5;
      const truncatedCode = codeDisplay.substring(0, maxCodeWidth);
      
      console.log(`${truncatedCode.padEnd(maxCodeWidth, ' ')} │ ${minimapLine}`);
    }
    
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 80)));
    this.displayControls();
  }

  private buildMinimap(viewportStart: number, viewportEnd: number): string[] {
    const minimap: string[] = [];
    const totalLines = this.fileContent.length;
    const scale = this.viewportHeight / totalLines;
    
    for (let i = 0; i < this.viewportHeight; i++) {
      const fileLine = Math.floor(i / scale);
      const inViewport = fileLine >= viewportStart && fileLine < viewportEnd;
      
      // Find region for this line
      const region = this.regions.find(r => fileLine >= r.startLine && fileLine <= r.endLine);
      
      let minimapLine = '';
      
      if (region) {
        const indent = ' '.repeat(Math.min(region.level * 2, 8));
        
        if (fileLine === region.startLine) {
          // Region label
          minimapLine = chalk.bold(this.getRegionColor(region.type)(
            indent + region.label.substring(0, this.minimapWidth - indent.length - 2)
          ));
        } else {
          // Region body
          const density = this.getLineDensity(this.fileContent[fileLine] || '');
          const bar = this.getDensityBar(density, region.type);
          minimapLine = indent + bar;
        }
      } else {
        // Empty space
        minimapLine = ' '.repeat(this.minimapWidth);
      }
      
      // Highlight viewport
      if (inViewport) {
        minimapLine = chalk.inverse(minimapLine);
      }
      
      minimap.push(minimapLine.padEnd(this.minimapWidth));
    }
    
    return minimap;
  }

  private getRegionColor(type: MinimapRegion['type']) {
    switch (type) {
      case 'function': return chalk.yellow;
      case 'class': return chalk.magenta;
      case 'section': return chalk.cyan;
      case 'comment': return chalk.gray;
      case 'import': return chalk.green;
      default: return chalk.white;
    }
  }

  private getLineDensity(line: string): number {
    const trimmed = line.trim();
    if (!trimmed) return 0;
    if (trimmed.length < 20) return 1;
    if (trimmed.length < 40) return 2;
    if (trimmed.length < 60) return 3;
    return 4;
  }

  private getDensityBar(density: number, type: MinimapRegion['type']): string {
    const bars = ['░', '▒', '▓', '█'];
    const bar = bars[Math.min(density - 1, 3)] || ' ';
    const color = this.getRegionColor(type);
    return color(bar.repeat(Math.min(density * 2, 10)));
  }

  private syntaxHighlight(line: string): string {
    // Simple syntax highlighting
    return line
      .replace(/\b(function|class|const|let|var|if|else|for|while|return|async|await)\b/g, chalk.blue('$1'))
      .replace(/\b(true|false|null|undefined)\b/g, chalk.yellow('$1'))
      .replace(/"([^"]*)"/g, chalk.green('"$1"'))
      .replace(/'([^']*)'/g, chalk.green("'$1'"))
      .replace(/\/\/.*$/, chalk.gray('$&'))
      .replace(/\b\d+\b/g, chalk.yellow('$&'));
  }

  private displayControls() {
    const controls = [
      'Navigation:',
      '↑/↓ - Move line',
      'PgUp/PgDn - Page',
      'Home/End - Start/End',
      'Enter - Jump to region',
      'q - Quit'
    ];
    
    console.log(chalk.dim(controls.join(' | ')));
  }

  async start() {
    this.isActive = true;
    this.display();
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    readline.emitKeypressEvents(process.stdin);
    
    process.stdin.on('keypress', this.handleKeypress.bind(this));
  }

  private handleKeypress(str: string | undefined, key: readline.Key) {
    if (!this.isActive) return;
    
    switch (key.name) {
      case 'up':
        this.currentLine = Math.max(0, this.currentLine - 1);
        break;
      case 'down':
        this.currentLine = Math.min(this.fileContent.length - 1, this.currentLine + 1);
        break;
      case 'pageup':
        this.currentLine = Math.max(0, this.currentLine - this.viewportHeight);
        break;
      case 'pagedown':
        this.currentLine = Math.min(this.fileContent.length - 1, this.currentLine + this.viewportHeight);
        break;
      case 'home':
        this.currentLine = 0;
        break;
      case 'end':
        this.currentLine = this.fileContent.length - 1;
        break;
      case 'return':
        this.jumpToRegion();
        break;
      case 'q':
      case 'escape':
        this.stop();
        return;
    }
    
    this.display();
  }

  private jumpToRegion() {
    // Find nearest region
    const nearestRegion = this.regions.reduce((prev, curr) => {
      const prevDist = Math.abs(prev.startLine - this.currentLine);
      const currDist = Math.abs(curr.startLine - this.currentLine);
      return currDist < prevDist ? curr : prev;
    });
    
    if (nearestRegion) {
      this.currentLine = nearestRegion.startLine;
      this.emit('jump', {
        line: nearestRegion.startLine + 1,
        region: nearestRegion
      });
    }
  }

  stop() {
    this.isActive = false;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
    console.clear();
    this.emit('exit');
  }

  // Get current position info
  getCurrentPosition() {
    const region = this.regions.find(r => 
      this.currentLine >= r.startLine && this.currentLine <= r.endLine
    );
    
    return {
      line: this.currentLine + 1,
      column: 1,
      region: region ? {
        name: region.label,
        type: region.type
      } : null
    };
  }

  // Navigate to specific line
  goToLine(lineNumber: number) {
    this.currentLine = Math.max(0, Math.min(lineNumber - 1, this.fileContent.length - 1));
    this.display();
  }

  // Search and navigate
  async searchAndNavigate(searchTerm: string, caseSensitive: boolean = false) {
    const results: number[] = [];
    const search = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    
    this.fileContent.forEach((line, index) => {
      const content = caseSensitive ? line : line.toLowerCase();
      if (content.includes(search)) {
        results.push(index);
      }
    });
    
    if (results.length > 0) {
      // Navigate to first result after current position
      const nextResult = results.find(line => line > this.currentLine) || results[0];
      this.currentLine = nextResult;
      this.display();
      
      return {
        found: true,
        totalMatches: results.length,
        currentMatch: results.indexOf(nextResult) + 1,
        locations: results.map(line => ({
          line: line + 1,
          preview: this.fileContent[line].trim().substring(0, 50)
        }))
      };
    }
    
    return { found: false, totalMatches: 0 };
  }
}

// Export singleton instance
export const minimapNavigation = new MinimapNavigation();