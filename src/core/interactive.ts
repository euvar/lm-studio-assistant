import chalk from 'chalk';
import readline from 'readline';

export interface CollapsibleSection {
  title: string;
  content: string;
  isExpanded: boolean;
}

export class InteractiveDisplay {
  private sections: Map<string, CollapsibleSection> = new Map();
  private rl?: readline.Interface;

  addSection(id: string, title: string, content: string, expanded: boolean = false): void {
    this.sections.set(id, { title, content, isExpanded: expanded });
  }

  render(): string {
    let output = '';
    
    this.sections.forEach((section, id) => {
      const arrow = section.isExpanded ? '▼' : '▶';
      const header = chalk.bgGray.black(` ${arrow} ${section.title} `);
      
      output += `\n${header}\n`;
      
      if (section.isExpanded) {
        // Show content with indentation
        const lines = section.content.split('\n');
        lines.forEach(line => {
          output += chalk.dim('  │ ') + line + '\n';
        });
        output += chalk.dim('  └─────\n');
      } else {
        output += chalk.dim('  [Click to expand]\n');
      }
    });
    
    return output;
  }

  toggleSection(id: string): void {
    const section = this.sections.get(id);
    if (section) {
      section.isExpanded = !section.isExpanded;
    }
  }

  clear(): void {
    this.sections.clear();
  }
}

// Simplified collapsible output for CLI
export function formatCollapsible(title: string, content: string, expanded: boolean = false): string {
  const arrow = expanded ? '▼' : '▶';
  const header = chalk.dim(`${arrow} ${title}`);
  
  if (expanded) {
    return `${header}\n${content.split('\n').map(line => '  ' + line).join('\n')}`;
  } else {
    return header;
  }
}

// Format tool execution with collapsible details
export function formatToolExecution(toolName: string, params: any, result: any, duration: number): string {
  const success = result.success !== false;
  const icon = success ? '✓' : '✗';
  const color = success ? chalk.green : chalk.red;
  
  // Main header - always visible
  let output = color(`${icon} ${toolName}`) + chalk.dim(` (${duration}ms)`);
  
  // Add brief summary based on tool type
  const summary = getToolSummary(toolName, params, result);
  if (summary) {
    output += ' - ' + chalk.dim(summary);
  }
  
  // Technical details in a collapsible section (hidden by default)
  const details = chalk.dim(`
    Parameters: ${JSON.stringify(params, null, 2)}
    Raw Result: ${JSON.stringify(result).substring(0, 200)}...
  `);
  
  // For now, just show a hint that details are available
  output += '\n' + chalk.dim('  💡 Technical details hidden. Use --verbose to see full output.');
  
  return output;
}

function getToolSummary(toolName: string, params: any, result: any): string {
  switch (toolName) {
    case 'readFile':
      return `Read ${params.path}`;
    case 'writeFile':
      return `Created ${params.path}`;
    case 'editFile':
      return `Edited ${params.path}`;
    case 'getWeather':
      return `Weather for ${params.city}`;
    case 'webSearch':
      return `Searched for "${params.query}"`;
    case 'fetchWebPage':
      return result.success ? `Fetched ${params.url}` : 'Failed to fetch page';
    case 'bash':
      return `Ran: ${params.command}`;
    case 'gitStatus':
      return 'Checked git status';
    case 'gitCommit':
      return `Created commit: "${params.message}"`;
    default:
      return '';
  }
}