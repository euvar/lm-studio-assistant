import chalk from 'chalk';
import inquirer from 'inquirer';

export interface CommandConfirmation {
  command: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export class CommandConfirmationManager {
  private readonly dangerousCommands = [
    'rm', 'delete', 'kill', 'pkill', 'shutdown', 'reboot',
    'format', 'mkfs', 'dd', 'chmod', 'chown', 'sudo'
  ];

  async confirmExecution(toolName: string, parameters: any): Promise<boolean> {
    // Only confirm dangerous tools
    if (toolName !== 'bash' && toolName !== 'runCode') {
      return true;
    }

    const command = parameters.command || parameters.code || '';
    const risk = this.assessRisk(command);
    
    if (risk === 'low') {
      // Auto-approve low risk commands
      return true;
    }

    // Show command details
    console.log(chalk.yellow('\n⚠️  Command requires confirmation:'));
    console.log(chalk.cyan(`Tool: ${toolName}`));
    console.log(chalk.white(`Command: ${command}`));
    console.log(chalk.yellow(`Risk Level: ${risk.toUpperCase()}`));
    
    if (risk === 'high') {
      console.log(chalk.red('⚠️  WARNING: This command could be destructive!'));
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Do you want to execute this command?',
        default: risk === 'medium',
      },
    ]);

    return confirmed;
  }

  private assessRisk(command: string): 'low' | 'medium' | 'high' {
    const lowerCommand = command.toLowerCase();
    
    // High risk patterns
    if (
      lowerCommand.includes('rm -rf') ||
      lowerCommand.includes('sudo rm') ||
      lowerCommand.includes('format') ||
      lowerCommand.includes('dd if=') ||
      lowerCommand.includes('shutdown') ||
      lowerCommand.includes('reboot') ||
      /kill\s+-9/.test(lowerCommand)
    ) {
      return 'high';
    }

    // Check for dangerous commands
    for (const dangerous of this.dangerousCommands) {
      if (new RegExp(`\\b${dangerous}\\b`).test(lowerCommand)) {
        return 'medium';
      }
    }

    // Commands that modify system state
    if (
      lowerCommand.includes('install') ||
      lowerCommand.includes('update') ||
      lowerCommand.includes('upgrade') ||
      lowerCommand.includes('npm i') ||
      lowerCommand.includes('pip install')
    ) {
      return 'medium';
    }

    return 'low';
  }

  formatCommandForDisplay(command: string): string {
    // Highlight dangerous parts in red
    let formatted = command;
    
    for (const dangerous of this.dangerousCommands) {
      formatted = formatted.replace(
        new RegExp(`\\b(${dangerous})\\b`, 'gi'),
        chalk.red('$1')
      );
    }

    return formatted;
  }
}