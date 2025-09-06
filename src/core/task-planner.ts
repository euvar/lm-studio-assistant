import chalk from 'chalk';
import ora from 'ora';
import { EventEmitter } from 'events';

export interface Task {
  id: string;
  name: string;
  description?: string;
  type: 'sequential' | 'parallel';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  subtasks?: Task[];
  dependencies?: string[];
  result?: any;
  error?: Error;
  startTime?: Date;
  endTime?: Date;
}

export interface TaskPlan {
  id: string;
  name: string;
  description?: string;
  tasks: Task[];
  createdAt: Date;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}

export class TaskPlanner extends EventEmitter {
  private plans: Map<string, TaskPlan> = new Map();
  private currentPlan?: TaskPlan;
  private taskHandlers: Map<string, (task: Task) => Promise<any>> = new Map();

  createPlan(name: string, description?: string): TaskPlan {
    const plan: TaskPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      tasks: [],
      createdAt: new Date(),
      status: 'planning',
    };

    this.plans.set(plan.id, plan);
    this.currentPlan = plan;
    return plan;
  }

  addTask(task: Omit<Task, 'id' | 'status'>): Task {
    if (!this.currentPlan) {
      throw new Error('No active plan. Create a plan first.');
    }

    const fullTask: Task = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
    };

    this.currentPlan.tasks.push(fullTask);
    return fullTask;
  }

  addSubtask(parentTaskId: string, subtask: Omit<Task, 'id' | 'status'>): Task {
    if (!this.currentPlan) {
      throw new Error('No active plan.');
    }

    const parentTask = this.findTask(parentTaskId, this.currentPlan.tasks);
    if (!parentTask) {
      throw new Error('Parent task not found.');
    }

    const fullSubtask: Task = {
      ...subtask,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
    };

    if (!parentTask.subtasks) {
      parentTask.subtasks = [];
    }
    parentTask.subtasks.push(fullSubtask);

    return fullSubtask;
  }

  registerTaskHandler(taskType: string, handler: (task: Task) => Promise<any>): void {
    this.taskHandlers.set(taskType, handler);
  }

  async executePlan(planId?: string): Promise<void> {
    const plan = planId ? this.plans.get(planId) : this.currentPlan;
    if (!plan) {
      throw new Error('No plan found to execute.');
    }

    plan.status = 'executing';
    this.emit('plan:start', plan);

    console.log(chalk.cyan(`\n🚀 Executing plan: ${plan.name}\n`));

    try {
      for (const task of plan.tasks) {
        await this.executeTask(task);
      }

      plan.status = 'completed';
      this.emit('plan:complete', plan);
      console.log(chalk.green(`\n✅ Plan completed successfully!\n`));
    } catch (error) {
      plan.status = 'failed';
      this.emit('plan:error', { plan, error });
      console.log(chalk.red(`\n❌ Plan failed: ${error}\n`));
      throw error;
    }
  }

  private async executeTask(task: Task, indent: number = 0): Promise<any> {
    const indentStr = '  '.repeat(indent);
    
    // Check dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      const allTasks = this.getAllTasks(this.currentPlan!.tasks);
      for (const depId of task.dependencies) {
        const dep = allTasks.find(t => t.id === depId);
        if (!dep || dep.status !== 'completed') {
          task.status = 'skipped';
          console.log(chalk.yellow(`${indentStr}⏭️  Skipping ${task.name} (unmet dependencies)`));
          return;
        }
      }
    }

    task.status = 'running';
    task.startTime = new Date();

    const spinner = ora({
      text: task.name,
      indent: indent * 2,
    }).start();

    this.emit('task:start', task);

    try {
      // Execute subtasks if any
      if (task.subtasks && task.subtasks.length > 0) {
        if (task.type === 'parallel') {
          // Execute subtasks in parallel
          spinner.text = `${task.name} (parallel execution)`;
          const subtaskPromises = task.subtasks.map(subtask => 
            this.executeTask(subtask, indent + 1)
          );
          await Promise.all(subtaskPromises);
        } else {
          // Execute subtasks sequentially
          spinner.text = `${task.name} (sequential execution)`;
          for (const subtask of task.subtasks) {
            await this.executeTask(subtask, indent + 1);
          }
        }
      }

      // Execute the task itself if it has a handler
      const handler = this.taskHandlers.get(task.name);
      if (handler) {
        task.result = await handler(task);
      }

      task.status = 'completed';
      task.endTime = new Date();
      task.progress = 100;

      spinner.succeed(chalk.green(`${task.name} ✓`));
      this.emit('task:complete', task);

      return task.result;
    } catch (error) {
      task.status = 'failed';
      task.endTime = new Date();
      task.error = error instanceof Error ? error : new Error(String(error));

      spinner.fail(chalk.red(`${task.name} ✗`));
      this.emit('task:error', { task, error });

      throw error;
    }
  }

  private findTask(taskId: string, tasks: Task[]): Task | undefined {
    for (const task of tasks) {
      if (task.id === taskId) {
        return task;
      }
      if (task.subtasks) {
        const found = this.findTask(taskId, task.subtasks);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  private getAllTasks(tasks: Task[]): Task[] {
    const allTasks: Task[] = [];
    for (const task of tasks) {
      allTasks.push(task);
      if (task.subtasks) {
        allTasks.push(...this.getAllTasks(task.subtasks));
      }
    }
    return allTasks;
  }

  visualizePlan(planId?: string): string {
    const plan = planId ? this.plans.get(planId) : this.currentPlan;
    if (!plan) {
      return 'No plan found.';
    }

    let output = chalk.cyan(`\n📋 Plan: ${plan.name}\n`);
    if (plan.description) {
      output += chalk.dim(`   ${plan.description}\n`);
    }
    output += chalk.dim(`   Status: ${plan.status}\n`);
    output += chalk.dim(`   Created: ${plan.createdAt.toLocaleString()}\n\n`);

    const renderTask = (task: Task, indent: number = 0): string => {
      const indentStr = '  '.repeat(indent);
      const statusIcon = this.getStatusIcon(task.status);
      const progressBar = task.progress ? this.renderProgressBar(task.progress) : '';
      
      let result = `${indentStr}${statusIcon} ${task.name}`;
      if (task.description) {
        result += chalk.dim(` - ${task.description}`);
      }
      if (progressBar) {
        result += ` ${progressBar}`;
      }
      result += '\n';

      if (task.subtasks && task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
          result += renderTask(subtask, indent + 1);
        }
      }

      return result;
    };

    for (const task of plan.tasks) {
      output += renderTask(task);
    }

    return output;
  }

  private getStatusIcon(status: Task['status']): string {
    switch (status) {
      case 'pending': return '○';
      case 'running': return chalk.blue('◐');
      case 'completed': return chalk.green('●');
      case 'failed': return chalk.red('✗');
      case 'skipped': return chalk.yellow('⏭');
      default: return '?';
    }
  }

  private renderProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.floor(width * progress / 100);
    const empty = width - filled;
    return chalk.dim('[') + 
           chalk.green('█'.repeat(filled)) + 
           chalk.dim('░'.repeat(empty)) + 
           chalk.dim(']') + 
           chalk.dim(` ${progress}%`);
  }

  getCurrentPlan(): TaskPlan | undefined {
    return this.currentPlan;
  }

  getPlan(planId: string): TaskPlan | undefined {
    return this.plans.get(planId);
  }

  getAllPlans(): TaskPlan[] {
    return Array.from(this.plans.values());
  }

  updateTaskProgress(taskId: string, progress: number): void {
    if (!this.currentPlan) return;
    
    const task = this.findTask(taskId, this.currentPlan.tasks);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
      this.emit('task:progress', { task, progress: task.progress });
    }
  }
}