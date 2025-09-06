import { EventEmitter } from 'events';
import chalk from 'chalk';
import boxen from 'boxen';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  progress: number;
  dependencies: string[];
  subtasks: Task[];
  estimatedTime?: number;
  actualTime?: number;
  startedAt?: Date;
  completedAt?: Date;
  assignedAgent?: string;
}

export interface TaskGraph {
  tasks: Map<string, Task>;
  edges: Map<string, string[]>;
}

export class VisualTaskPlanner extends EventEmitter {
  private taskGraph: TaskGraph = {
    tasks: new Map(),
    edges: new Map()
  };
  
  private activeTaskId: string | null = null;

  createTask(params: {
    title: string;
    description: string;
    dependencies?: string[];
    estimatedTime?: number;
  }): Task {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const task: Task = {
      id,
      title: params.title,
      description: params.description,
      status: 'pending',
      progress: 0,
      dependencies: params.dependencies || [],
      subtasks: [],
      estimatedTime: params.estimatedTime
    };
    
    this.taskGraph.tasks.set(id, task);
    
    // Update dependency graph
    for (const depId of task.dependencies) {
      if (!this.taskGraph.edges.has(depId)) {
        this.taskGraph.edges.set(depId, []);
      }
      this.taskGraph.edges.get(depId)!.push(id);
    }
    
    this.emit('taskCreated', task);
    return task;
  }

  createSubtask(parentId: string, subtaskParams: Omit<Parameters<typeof this.createTask>[0], 'dependencies'>): Task | null {
    const parent = this.taskGraph.tasks.get(parentId);
    if (!parent) return null;
    
    const subtask = this.createTask({
      ...subtaskParams,
      dependencies: [parentId]
    });
    
    parent.subtasks.push(subtask);
    return subtask;
  }

  startTask(taskId: string): boolean {
    const task = this.taskGraph.tasks.get(taskId);
    if (!task) return false;
    
    // Check if dependencies are completed
    for (const depId of task.dependencies) {
      const dep = this.taskGraph.tasks.get(depId);
      if (!dep || dep.status !== 'completed') {
        task.status = 'blocked';
        this.emit('taskBlocked', task, depId);
        return false;
      }
    }
    
    task.status = 'in-progress';
    task.startedAt = new Date();
    this.activeTaskId = taskId;
    
    this.emit('taskStarted', task);
    return true;
  }

  updateProgress(taskId: string, progress: number) {
    const task = this.taskGraph.tasks.get(taskId);
    if (!task || task.status !== 'in-progress') return;
    
    task.progress = Math.min(100, Math.max(0, progress));
    this.emit('taskProgress', task);
    
    // Update parent progress based on subtasks
    if (task.dependencies.length > 0) {
      this.updateParentProgress(task.dependencies[0]);
    }
  }

  private updateParentProgress(parentId: string) {
    const parent = this.taskGraph.tasks.get(parentId);
    if (!parent || parent.subtasks.length === 0) return;
    
    const totalProgress = parent.subtasks.reduce((sum, subtask) => {
      const t = this.taskGraph.tasks.get(subtask.id);
      return sum + (t?.progress || 0);
    }, 0);
    
    parent.progress = totalProgress / parent.subtasks.length;
  }

  completeTask(taskId: string) {
    const task = this.taskGraph.tasks.get(taskId);
    if (!task || task.status !== 'in-progress') return;
    
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date();
    
    if (task.startedAt) {
      task.actualTime = (task.completedAt.getTime() - task.startedAt.getTime()) / 1000 / 60;
    }
    
    this.emit('taskCompleted', task);
    
    // Check if any blocked tasks can now proceed
    const dependents = this.taskGraph.edges.get(taskId) || [];
    for (const depId of dependents) {
      const dep = this.taskGraph.tasks.get(depId);
      if (dep && dep.status === 'blocked') {
        this.startTask(depId);
      }
    }
  }

  getExecutableTaskIds(): string[] {
    const executable: string[] = [];
    
    for (const [id, task] of this.taskGraph.tasks) {
      if (task.status === 'pending') {
        const depsCompleted = task.dependencies.every(depId => {
          const dep = this.taskGraph.tasks.get(depId);
          return dep && dep.status === 'completed';
        });
        
        if (depsCompleted) {
          executable.push(id);
        }
      }
    }
    
    return executable;
  }

  visualize(): string {
    const lines: string[] = [];
    
    // Header
    lines.push(boxen('Task Manager', {
      padding: 0,
      borderStyle: 'round',
      borderColor: 'cyan'
    }));
    
    lines.push('');
    
    // Tasks by status
    const statusGroups = {
      'in-progress': [] as Task[],
      'blocked': [] as Task[],
      'pending': [] as Task[],
      'completed': [] as Task[]
    };
    
    for (const task of this.taskGraph.tasks.values()) {
      statusGroups[task.status].push(task);
    }
    
    // In-progress tasks
    if (statusGroups['in-progress'].length > 0) {
      lines.push(chalk.yellow('▶ In Progress:'));
      for (const task of statusGroups['in-progress']) {
        lines.push(this.formatTaskLine(task));
      }
      lines.push('');
    }
    
    // Blocked tasks
    if (statusGroups['blocked'].length > 0) {
      lines.push(chalk.red('⏸ Blocked:'));
      for (const task of statusGroups['blocked']) {
        lines.push(this.formatTaskLine(task));
      }
      lines.push('');
    }
    
    // Pending tasks
    if (statusGroups['pending'].length > 0) {
      lines.push(chalk.blue('⏳ Pending:'));
      for (const task of statusGroups['pending']) {
        lines.push(this.formatTaskLine(task));
      }
      lines.push('');
    }
    
    // Recently completed
    const recentCompleted = statusGroups['completed']
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
      .slice(0, 3);
    
    if (recentCompleted.length > 0) {
      lines.push(chalk.green('✓ Recently Completed:'));
      for (const task of recentCompleted) {
        lines.push(this.formatTaskLine(task));
      }
      lines.push('');
    }
    
    // Dependencies visualization
    const activeDeps = this.getActiveDependencies();
    if (activeDeps.length > 0) {
      lines.push(chalk.gray('Dependencies:'));
      for (const dep of activeDeps) {
        lines.push(chalk.gray(`  ${dep}`));
      }
      lines.push('');
    }
    
    // Time estimates
    const timeEstimate = this.calculateRemainingTime();
    if (timeEstimate > 0) {
      lines.push(chalk.cyan(`Time estimate: ~${Math.ceil(timeEstimate)} min remaining`));
    }
    
    return lines.join('\n');
  }

  private formatTaskLine(task: Task): string {
    const progressBar = this.createProgressBar(task.progress);
    const statusIcon = this.getStatusIcon(task.status);
    const timeInfo = task.estimatedTime ? chalk.gray(` (${task.estimatedTime}m)`) : '';
    
    return `  ${statusIcon} ${task.title} ${progressBar} ${task.progress}%${timeInfo}`;
  }

  private createProgressBar(progress: number): string {
    const width = 10;
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  private getStatusIcon(status: Task['status']): string {
    switch (status) {
      case 'completed': return chalk.green('✓');
      case 'in-progress': return chalk.yellow('▶');
      case 'blocked': return chalk.red('⏸');
      case 'pending': return chalk.blue('⏳');
    }
  }

  private getActiveDependencies(): string[] {
    const deps: string[] = [];
    
    for (const [id, task] of this.taskGraph.tasks) {
      if (task.status === 'blocked' || task.status === 'pending') {
        for (const depId of task.dependencies) {
          const dep = this.taskGraph.tasks.get(depId);
          if (dep && dep.status !== 'completed') {
            deps.push(`${task.title} → ${dep.title}`);
          }
        }
      }
    }
    
    return deps;
  }

  private calculateRemainingTime(): number {
    let totalTime = 0;
    
    for (const task of this.taskGraph.tasks.values()) {
      if (task.status !== 'completed' && task.estimatedTime) {
        const progress = task.progress / 100;
        const remaining = task.estimatedTime * (1 - progress);
        totalTime += remaining;
      }
    }
    
    return totalTime;
  }

  exportToMermaid(): string {
    const lines = ['graph TD'];
    
    // Add nodes
    for (const [id, task] of this.taskGraph.tasks) {
      const label = `${task.title}<br/>${task.progress}%`;
      const style = this.getMermaidStyle(task.status);
      lines.push(`    ${id}["${label}"]${style}`);
    }
    
    // Add edges
    for (const [id, task] of this.taskGraph.tasks) {
      for (const depId of task.dependencies) {
        lines.push(`    ${depId} --> ${id}`);
      }
    }
    
    return lines.join('\n');
  }

  private getMermaidStyle(status: Task['status']): string {
    switch (status) {
      case 'completed': return ':::completed';
      case 'in-progress': return ':::inprogress';
      case 'blocked': return ':::blocked';
      default: return '';
    }
  }

  async executeInParallel(agentExecutor: (task: Task) => Promise<void>) {
    const executing = new Set<string>();
    const maxParallel = 3;
    
    const tryExecuteNext = async () => {
      if (executing.size >= maxParallel) return;
      
      const executable = this.getExecutableTaskIds()
        .filter(id => !executing.has(id));
      
      if (executable.length === 0) return;
      
      const taskId = executable[0];
      executing.add(taskId);
      
      if (this.startTask(taskId)) {
        const task = this.taskGraph.tasks.get(taskId)!;
        
        try {
          await agentExecutor(task);
          this.completeTask(taskId);
        } catch (error) {
          console.error(`Task ${taskId} failed:`, error);
          task.status = 'blocked';
        } finally {
          executing.delete(taskId);
          // Try to execute next task
          await tryExecuteNext();
        }
      }
    };
    
    // Start initial parallel execution
    const promises: Promise<void>[] = [];
    for (let i = 0; i < maxParallel; i++) {
      promises.push(tryExecuteNext());
    }
    
    await Promise.all(promises);
  }

  getStats() {
    const stats = {
      total: this.taskGraph.tasks.size,
      byStatus: {} as Record<Task['status'], number>,
      averageCompletionTime: 0,
      estimateAccuracy: 0
    };
    
    let completionTimes: number[] = [];
    let accuracyData: { estimated: number; actual: number }[] = [];
    
    for (const task of this.taskGraph.tasks.values()) {
      stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
      
      if (task.actualTime) {
        completionTimes.push(task.actualTime);
        if (task.estimatedTime) {
          accuracyData.push({
            estimated: task.estimatedTime,
            actual: task.actualTime
          });
        }
      }
    }
    
    if (completionTimes.length > 0) {
      stats.averageCompletionTime = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
    }
    
    if (accuracyData.length > 0) {
      const accuracySum = accuracyData.reduce((sum, data) => {
        const accuracy = Math.min(data.estimated, data.actual) / Math.max(data.estimated, data.actual);
        return sum + accuracy;
      }, 0);
      stats.estimateAccuracy = accuracySum / accuracyData.length;
    }
    
    return stats;
  }
}