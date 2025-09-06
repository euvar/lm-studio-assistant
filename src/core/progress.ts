import chalk from 'chalk';
import ora, { Ora } from 'ora';

export interface ProgressStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
}

export class ProgressTracker {
  private steps: ProgressStep[] = [];
  private currentSpinner: Ora | null = null;
  private startTime: number = Date.now();

  constructor(private title: string) {}

  addStep(name: string): void {
    this.steps.push({ name, status: 'pending' });
  }

  startStep(name: string, detail?: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) {
      step.status = 'running';
      step.detail = detail;
    }
    
    this.render();
  }

  completeStep(name: string, detail?: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) {
      step.status = 'done';
      step.detail = detail;
    }
    
    this.render();
  }

  failStep(name: string, error?: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) {
      step.status = 'failed';
      step.detail = error;
    }
    
    this.render();
  }

  private render(): void {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }

    // Clear previous output
    console.clear();
    console.log(chalk.bold.cyan(`\n${this.title}\n`));

    for (const step of this.steps) {
      const icon = this.getStepIcon(step.status);
      const color = this.getStepColor(step.status);
      const detail = step.detail ? chalk.dim(` - ${step.detail}`) : '';
      
      console.log(`  ${icon} ${color(step.name)}${detail}`);
    }

    // Find current running step
    const runningStep = this.steps.find(s => s.status === 'running');
    if (runningStep) {
      this.currentSpinner = ora({
        text: chalk.dim('Working...'),
        indent: 4,
      }).start();
    }

    // Show elapsed time
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    console.log(chalk.dim(`\n  Elapsed: ${elapsed}s\n`));
  }

  private getStepIcon(status: ProgressStep['status']): string {
    switch (status) {
      case 'pending': return chalk.gray('○');
      case 'running': return chalk.blue('●');
      case 'done': return chalk.green('✓');
      case 'failed': return chalk.red('✗');
    }
  }

  private getStepColor(status: ProgressStep['status']) {
    switch (status) {
      case 'pending': return chalk.gray;
      case 'running': return chalk.blue;
      case 'done': return chalk.green;
      case 'failed': return chalk.red;
    }
  }

  finish(): void {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }

    const failed = this.steps.filter(s => s.status === 'failed').length;
    const completed = this.steps.filter(s => s.status === 'done').length;
    const total = this.steps.length;

    console.log('\n' + chalk.dim('─'.repeat(40)) + '\n');
    
    if (failed > 0) {
      console.log(chalk.red(`⚠️  ${failed} of ${total} steps failed`));
    } else {
      console.log(chalk.green(`✨ All ${total} steps completed successfully!`));
    }
    
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    console.log(chalk.dim(`Total time: ${elapsed}s\n`));
  }
}

export class SimpleProgress {
  private spinner: Ora;
  private startTime: number;

  constructor(text: string) {
    this.spinner = ora(text).start();
    this.startTime = Date.now();
  }

  update(text: string): void {
    this.spinner.text = text;
  }

  succeed(text?: string): void {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    this.spinner.succeed(text ? `${text} (${elapsed}s)` : undefined);
  }

  fail(text?: string): void {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    this.spinner.fail(text ? `${text} (${elapsed}s)` : undefined);
  }

  info(text: string): void {
    this.spinner.info(text);
  }
}