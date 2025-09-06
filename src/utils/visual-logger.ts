import chalk from 'chalk';

export class VisualLogger {
  private indentLevel = 0;
  private activeAgents: Set<string> = new Set();
  
  // Color scheme matching Claude's interface
  private colors = {
    orchestrator: chalk.yellow,      // Yellow for main orchestrator
    agent: chalk.white,              // White for agent execution
    success: chalk.green,            // Green for completed tasks
    error: chalk.red,                // Red for errors
    tool: chalk.cyan,                // Cyan for tool usage
    dim: chalk.gray,                 // Gray for secondary info
    highlight: chalk.magenta         // Magenta for important info
  };

  // Special symbols
  private symbols = {
    bullet: '●',
    arrow: '→',
    check: '✓',
    cross: '✗',
    running: '►',
    completed: '■',
    pending: '□',
    branch: '└─',
    pipe: '│ '
  };

  orchestratorStart(taskId: string, description: string) {
    console.log(this.colors.orchestrator(`\n${this.symbols.bullet} Orchestrator planning: ${description}`));
    console.log(this.colors.dim(`  Task ID: ${taskId}`));
    this.indentLevel++;
  }

  orchestratorStep(step: number, total: number, action: string) {
    const indent = this.getIndent();
    console.log(this.colors.orchestrator(`${indent}${this.symbols.arrow} Step ${step}/${total}: ${action}`));
  }

  agentStart(agentName: string, action: string) {
    const indent = this.getIndent();
    this.activeAgents.add(agentName);
    console.log(`${indent}${this.colors.agent(`● ${agentName}`)}: ${action}`);
    this.indentLevel++;
  }

  agentEnd(agentName: string, success: boolean = true) {
    this.indentLevel--;
    const indent = this.getIndent();
    this.activeAgents.delete(agentName);
    
    if (success) {
      console.log(`${indent}${this.colors.success(`${this.symbols.check} ${agentName} completed`)}`);
    } else {
      console.log(`${indent}${this.colors.error(`${this.symbols.cross} ${agentName} failed`)}`);
    }
  }

  toolExecution(toolName: string, params?: any) {
    const indent = this.getIndent();
    console.log(`${indent}${this.colors.tool(`${this.symbols.running} Using ${toolName}...`)}`);
    if (params) {
      console.log(`${indent}${this.colors.dim(`  Parameters: ${JSON.stringify(params, null, 2).replace(/\n/g, '\n' + indent + '  ')}`)}`)
    }
  }

  toolResult(toolName: string, success: boolean, summary?: string) {
    const indent = this.getIndent();
    if (success) {
      console.log(`${indent}${this.colors.success(`${this.symbols.check} ${toolName}`)}: ${summary || 'Success'}`);
    } else {
      console.log(`${indent}${this.colors.error(`${this.symbols.cross} ${toolName}`)}: ${summary || 'Failed'}`);
    }
  }

  stepProgress(current: number, total: number, description: string) {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    
    const progressBar = `[${this.colors.success('█'.repeat(filled))}${'░'.repeat(empty)}]`;
    
    const indent = this.getIndent();
    console.log(`${indent}${progressBar} ${percent}% - ${description}`);
  }

  info(message: string, highlight: boolean = false) {
    const indent = this.getIndent();
    const color = highlight ? this.colors.highlight : this.colors.dim;
    console.log(`${indent}${color(message)}`);
  }

  success(message: string) {
    const indent = this.getIndent();
    console.log(`${indent}${this.colors.success(`${this.symbols.check} ${message}`)}`);
  }

  error(message: string) {
    const indent = this.getIndent();
    console.log(`${indent}${this.colors.error(`${this.symbols.cross} ${message}`)}`);
  }

  section(title: string) {
    console.log(this.colors.highlight(`\n═══ ${title} ═══\n`));
  }

  tree(items: Array<{ name: string; status: 'pending' | 'running' | 'completed' | 'error' }>) {
    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const prefix = isLast ? this.symbols.branch : '├─';
      const statusSymbol = {
        pending: this.symbols.pending,
        running: this.symbols.running,
        completed: this.symbols.check,
        error: this.symbols.cross
      }[item.status];
      
      const statusColor = {
        pending: this.colors.dim,
        running: this.colors.agent,
        completed: this.colors.success,
        error: this.colors.error
      }[item.status];
      
      console.log(`${statusColor(`${prefix} ${statusSymbol} ${item.name}`)}`);
    });
  }

  private getIndent(): string {
    return '  '.repeat(this.indentLevel);
  }

  reset() {
    this.indentLevel = 0;
    this.activeAgents.clear();
  }
}