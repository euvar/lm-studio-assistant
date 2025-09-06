import chalk from 'chalk';
import boxen from 'boxen';
import Table from 'cli-table3';
import ora from 'ora';
import * as marked from 'marked';
import TerminalRenderer from 'marked-terminal';
import figlet from 'figlet';

marked.setOptions({
  renderer: new TerminalRenderer() as any
});

interface ChartData {
  label: string;
  value: number;
}

interface ProgressOptions {
  width?: number;
  showPercentage?: boolean;
  showBar?: boolean;
  label?: string;
}

export class RichOutput {
  private spinners: Map<string, any> = new Map();

  // Headers and titles
  title(text: string, style: 'banner' | 'box' | 'simple' = 'simple') {
    switch (style) {
      case 'banner':
        console.log(chalk.cyan(figlet.textSync(text, {
          horizontalLayout: 'fitted',
          font: 'Small'
        })));
        break;
      
      case 'box':
        console.log(boxen(chalk.bold.white(text), {
          padding: 1,
          margin: 1,
          borderStyle: 'double',
          borderColor: 'cyan',
          align: 'center'
        }));
        break;
      
      case 'simple':
      default:
        console.log(chalk.bold.underline.cyan(text));
        break;
    }
  }

  subtitle(text: string) {
    console.log(chalk.bold.blue(`\n## ${text}\n`));
  }

  // Tables
  table(data: any[], options?: { headers?: string[] }) {
    if (data.length === 0) {
      this.warning('No data to display');
      return;
    }

    const headers = options?.headers || Object.keys(data[0]);
    const table = new Table({
      head: headers.map(h => chalk.bold.white(h)),
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    });

    for (const row of data) {
      const values = headers.map(h => {
        const value = row[h];
        if (typeof value === 'number') {
          return chalk.yellow(value.toString());
        } else if (typeof value === 'boolean') {
          return value ? chalk.green('✓') : chalk.red('✗');
        } else {
          return value?.toString() || '';
        }
      });
      table.push(values);
    }

    console.log(table.toString());
  }

  // Charts
  barChart(data: ChartData[], options?: { width?: number; height?: number }) {
    const maxValue = Math.max(...data.map(d => d.value));
    const width = options?.width || 40;

    console.log(chalk.bold.white('\nBar Chart:'));
    
    for (const item of data) {
      const barWidth = Math.round((item.value / maxValue) * width);
      const bar = '█'.repeat(barWidth);
      const empty = '░'.repeat(width - barWidth);
      const percentage = ((item.value / maxValue) * 100).toFixed(1);
      
      console.log(
        chalk.blue(item.label.padEnd(15)) +
        chalk.green(bar) +
        chalk.gray(empty) +
        chalk.yellow(` ${item.value} (${percentage}%)`)
      );
    }
  }

  pieChart(data: ChartData[]) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const segments = data.map(item => ({
      ...item,
      percentage: (item.value / total) * 100
    })).sort((a, b) => b.percentage - a.percentage);

    console.log(chalk.bold.white('\nPie Chart:'));
    
    for (const segment of segments) {
      const blocks = Math.round(segment.percentage / 5);
      const bar = '█'.repeat(blocks);
      
      console.log(
        chalk.blue(segment.label.padEnd(15)) +
        chalk.green(bar) +
        chalk.yellow(` ${segment.percentage.toFixed(1)}% (${segment.value})`)
      );
    }
  }

  // Progress indicators
  progressBar(progress: number, options?: ProgressOptions) {
    const width = options?.width || 30;
    const percentage = Math.min(100, Math.max(0, progress));
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    let output = '';
    
    if (options?.label) {
      output += chalk.white(options.label) + ' ';
    }
    
    if (options?.showBar !== false) {
      output += '[' + chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ']';
    }
    
    if (options?.showPercentage !== false) {
      output += chalk.yellow(` ${percentage}%`);
    }
    
    console.log(output);
  }

  spinner(id: string, text: string, type: 'start' | 'succeed' | 'fail' | 'info' = 'start') {
    let spinner = this.spinners.get(id);
    
    if (type === 'start' && !spinner) {
      spinner = ora({
        text,
        spinner: 'dots',
        color: 'cyan'
      }).start();
      this.spinners.set(id, spinner);
    } else if (spinner) {
      switch (type) {
        case 'succeed':
          spinner.succeed(text);
          this.spinners.delete(id);
          break;
        case 'fail':
          spinner.fail(text);
          this.spinners.delete(id);
          break;
        case 'info':
          spinner.info(text);
          this.spinners.delete(id);
          break;
        default:
          spinner.text = text;
      }
    }
  }

  // Markdown rendering
  markdown(content: string) {
    console.log(marked.parse(content));
  }

  // Code highlighting
  code(code: string, language?: string) {
    const header = language ? chalk.gray(`// ${language}`) + '\n' : '';
    const lines = code.split('\n');
    const maxLineNumWidth = lines.length.toString().length;
    
    const highlighted = lines.map((line, i) => {
      const lineNum = chalk.gray((i + 1).toString().padStart(maxLineNumWidth));
      return `${lineNum} │ ${this.highlightSyntax(line, language)}`;
    }).join('\n');
    
    console.log(boxen(header + highlighted, {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'gray'
    }));
  }

  private highlightSyntax(line: string, language?: string): string {
    // Simple syntax highlighting
    if (language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts') {
      return line
        .replace(/\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await)\b/g, chalk.blue('$1'))
        .replace(/\b(true|false|null|undefined)\b/g, chalk.yellow('$1'))
        .replace(/'([^']*)'|"([^"]*)"/g, chalk.green('$&'))
        .replace(/\/\/.*$/g, chalk.gray('$&'))
        .replace(/\b\d+\b/g, chalk.magenta('$&'));
    }
    return line;
  }

  // Status messages
  success(message: string) {
    console.log(chalk.green('✓') + ' ' + chalk.bold.green(message));
  }

  error(message: string) {
    console.log(chalk.red('✗') + ' ' + chalk.bold.red(message));
  }

  warning(message: string) {
    console.log(chalk.yellow('⚠') + ' ' + chalk.bold.yellow(message));
  }

  info(message: string) {
    console.log(chalk.blue('ℹ') + ' ' + chalk.bold.blue(message));
  }

  // Lists
  list(items: string[], ordered: boolean = false) {
    items.forEach((item, index) => {
      const prefix = ordered 
        ? chalk.cyan(`${index + 1}.`) 
        : chalk.cyan('•');
      console.log(`  ${prefix} ${item}`);
    });
  }

  tree(data: any, indent: string = '') {
    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data);
      entries.forEach(([key, value], index) => {
        const isLast = index === entries.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const extension = isLast ? '    ' : '│   ';
        
        console.log(chalk.gray(indent + prefix) + chalk.white(key));
        
        if (typeof value === 'object' && value !== null) {
          this.tree(value, indent + extension);
        } else {
          console.log(chalk.gray(indent + extension + '└── ') + chalk.yellow(String(value)));
        }
      });
    }
  }

  // Interactive elements
  async select(options: string[], message: string = 'Select an option:'): Promise<string> {
    console.log(chalk.bold.white(message));
    this.list(options, true);
    
    // In a real implementation, this would use inquirer or similar
    // For now, just return the first option
    return options[0];
  }

  async confirm(message: string): Promise<boolean> {
    console.log(chalk.bold.white(message) + chalk.gray(' (y/n)'));
    
    // In a real implementation, this would wait for user input
    // For now, just return true
    return true;
  }

  // Box layouts
  box(content: string, options?: any) {
    console.log(boxen(content, {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      ...options
    }));
  }

  columns(columns: { title: string; content: string[] }[], options?: { width?: number }) {
    const totalWidth = options?.width || process.stdout.columns || 80;
    const columnWidth = Math.floor(totalWidth / columns.length) - 3;
    
    // Headers
    const headers = columns.map(col => 
      chalk.bold.underline(col.title.padEnd(columnWidth))
    ).join(' │ ');
    console.log(headers);
    
    // Content
    const maxRows = Math.max(...columns.map(col => col.content.length));
    for (let i = 0; i < maxRows; i++) {
      const row = columns.map(col => {
        const content = col.content[i] || '';
        return content.substring(0, columnWidth).padEnd(columnWidth);
      }).join(' │ ');
      console.log(row);
    }
  }

  // Diff display
  diff(oldText: string, newText: string) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    
    console.log(chalk.bold.white('\nDiff:'));
    
    // Simple line-by-line diff
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine === newLine) {
        console.log('  ' + oldLine);
      } else if (oldLine === undefined) {
        console.log(chalk.green('+ ' + newLine));
      } else if (newLine === undefined) {
        console.log(chalk.red('- ' + oldLine));
      } else {
        console.log(chalk.red('- ' + oldLine));
        console.log(chalk.green('+ ' + newLine));
      }
    }
  }

  // Timeline
  timeline(events: { time: Date; event: string; type?: 'success' | 'error' | 'info' }[]) {
    console.log(chalk.bold.white('\nTimeline:'));
    
    events.forEach((item, index) => {
      const isLast = index === events.length - 1;
      const connector = isLast ? '└─' : '├─';
      const line = isLast ? '  ' : '│ ';
      
      const icon = item.type === 'success' ? chalk.green('✓') :
                   item.type === 'error' ? chalk.red('✗') :
                   chalk.blue('●');
      
      const time = chalk.gray(item.time.toLocaleTimeString());
      console.log(chalk.gray(connector) + icon + ' ' + time + ' ' + item.event);
      
      if (!isLast) {
        console.log(chalk.gray(line));
      }
    });
  }

  // Clear screen
  clear() {
    console.clear();
  }

  // Separator
  separator(char: string = '─', color: string = 'gray') {
    const width = process.stdout.columns || 80;
    const colorFn = (chalk as any)[color];
    if (colorFn) {
      console.log(colorFn(char.repeat(width)));
    } else {
      console.log(char.repeat(width));
    }
  }

  // Stats display
  stats(data: Record<string, number | string>) {
    const table = new Table({
      style: {
        head: ['cyan'],
        border: ['gray']
      },
      colWidths: [20, 20]
    });

    for (const [key, value] of Object.entries(data)) {
      table.push([
        chalk.white(key),
        typeof value === 'number' ? chalk.yellow(value.toString()) : chalk.green(value)
      ]);
    }

    console.log(table.toString());
  }
}