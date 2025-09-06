import chalk from 'chalk';
import { ToolCall, ToolResult } from '../tools/base.js';

export interface ToolExecutionInfo {
  call: ToolCall;
  result: ToolResult;
  duration: number;
}

export class ToolOutputFormatter {
  private showDetails: boolean = false;
  private collapsedTools: Set<string> = new Set();

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
  }

  formatToolExecution(info: ToolExecutionInfo, index: number): string {
    const { call, result, duration } = info;
    const isCollapsed = this.collapsedTools.has(`${call.tool}-${index}`);
    
    let output = '';
    
    // Tool header with collapsible indicator
    const icon = result.success ? '✓' : '✗';
    const color = result.success ? chalk.green : chalk.red;
    const arrow = isCollapsed ? '▶' : '▼';
    
    output += chalk.dim(`\n${arrow} `) + color(`${icon} ${call.tool}`) + chalk.dim(` (${duration}ms)\n`);
    
    // Show parameters only if expanded
    if (!isCollapsed && this.showDetails) {
      output += chalk.dim('  Parameters: ') + chalk.dim(JSON.stringify(call.parameters, null, 2).replace(/\n/g, '\n  ')) + '\n';
    }
    
    // Always show the main result, but format it nicely
    if (result.success && result.data) {
      // Don't show raw data, let the assistant format it
      if (!isCollapsed && this.showDetails) {
        output += chalk.dim('  [Technical output hidden - see response below]\n');
      }
    } else if (result.error) {
      output += chalk.red(`  Error: ${result.error}\n`);
    }
    
    return output;
  }

  formatToolSummary(executions: ToolExecutionInfo[]): string {
    if (executions.length === 0) return '';
    
    let output = chalk.dim('\n┌─ Tool Execution ');
    output += chalk.dim('─'.repeat(50 - 17) + '┐\n');
    
    executions.forEach((exec, index) => {
      output += this.formatToolExecution(exec, index);
    });
    
    output += chalk.dim('└' + '─'.repeat(51) + '┘\n');
    
    if (executions.length > 1) {
      const successCount = executions.filter(e => e.result.success).length;
      output += chalk.dim(`\n  Summary: ${successCount}/${executions.length} tools executed successfully\n`);
    }
    
    return output;
  }

  // Create a clean summary without technical details
  createCleanSummary(executions: ToolExecutionInfo[]): string {
    const summary: string[] = [];
    
    executions.forEach(exec => {
      if (exec.result.success) {
        switch (exec.call.tool) {
          case 'readFile':
            summary.push(`📄 Read file: ${exec.call.parameters.path}`);
            break;
          case 'writeFile':
            summary.push(`✏️ Created file: ${exec.call.parameters.path}`);
            break;
          case 'editFile':
            summary.push(`📝 Edited file: ${exec.call.parameters.path}`);
            break;
          case 'webSearch':
            summary.push(`🔍 Searched for: "${exec.call.parameters.query}"`);
            break;
          case 'listFiles':
            summary.push(`📁 Listed files in: ${exec.call.parameters.path || 'current directory'}`);
            break;
          case 'getWeather':
            summary.push(`🌤️ Got weather for: ${exec.call.parameters.city}`);
            break;
          case 'bash':
            summary.push(`💻 Executed command: ${exec.call.parameters.command}`);
            break;
          default:
            summary.push(`🔧 Used tool: ${exec.call.tool}`);
        }
      } else {
        summary.push(chalk.red(`❌ Failed: ${exec.call.tool} - ${exec.result.error}`));
      }
    });
    
    if (summary.length > 0) {
      return chalk.dim('\n' + summary.join('\n') + '\n');
    }
    
    return '';
  }
}

// Interactive tool output component
export class InteractiveToolOutput {
  private expanded: boolean = false;
  private executions: ToolExecutionInfo[] = [];
  
  addExecution(info: ToolExecutionInfo): void {
    this.executions.push(info);
  }
  
  render(): string {
    if (this.executions.length === 0) return '';
    
    let output = '';
    
    // Summary header
    const toolCount = this.executions.length;
    const successCount = this.executions.filter(e => e.result.success).length;
    const icon = this.expanded ? '▼' : '▶';
    
    output += chalk.bgGray.black(` ${icon} Tools Used (${successCount}/${toolCount}) `) + '\n';
    
    if (this.expanded) {
      // Show detailed view
      this.executions.forEach((exec, i) => {
        const color = exec.result.success ? chalk.green : chalk.red;
        const statusIcon = exec.result.success ? '✓' : '✗';
        
        output += chalk.dim(`  ${i + 1}. `) + color(`${statusIcon} ${exec.call.tool}`);
        output += chalk.dim(` (${exec.duration}ms)\n`);
        
        // Show parameters
        if (exec.call.parameters && Object.keys(exec.call.parameters).length > 0) {
          const params = JSON.stringify(exec.call.parameters, null, 2)
            .split('\n')
            .map((line, idx) => idx === 0 ? line : '     ' + line)
            .join('\n');
          output += chalk.dim(`     ${params}\n`);
        }
      });
    } else {
      // Show compact view - just tool names
      const toolNames = this.executions
        .map(e => e.result.success ? chalk.green(e.call.tool) : chalk.red(e.call.tool))
        .join(', ');
      output += chalk.dim(`  ${toolNames}\n`);
    }
    
    output += chalk.dim(`  Press [Space] to ${this.expanded ? 'collapse' : 'expand'}\n`);
    
    return output;
  }
  
  toggle(): void {
    this.expanded = !this.expanded;
  }
}