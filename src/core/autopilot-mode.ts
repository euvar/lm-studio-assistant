import { EventEmitter } from 'events';
import { LMStudioProvider } from '../providers/lmstudio.js';
import { VisualTaskPlanner, Task } from './visual-task-planner.js';
import { CodeIntelligence } from './code-intelligence.js';
import { SmartContextManager } from './smart-context.js';
import { RichOutput } from './rich-output.js';
import { Tool } from '../tools/base.js';
import chalk from 'chalk';

interface AutopilotTask {
  description: string;
  type: 'create' | 'fix' | 'optimize' | 'test' | 'deploy' | 'analyze';
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedTime: number;
  requirements?: string[];
  deliverables?: string[];
}

interface AutopilotPlan {
  id: string;
  goal: string;
  tasks: Task[];
  currentTaskIndex: number;
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  results: Map<string, any>;
  errors: Error[];
}

interface AutopilotOptions {
  confirmActions?: boolean;
  maxRetries?: number;
  timeoutMinutes?: number;
  parallelExecution?: boolean;
  verbosity?: 'quiet' | 'normal' | 'verbose';
  checkpoints?: boolean;
}

export class AutopilotMode extends EventEmitter {
  private provider: LMStudioProvider;
  private taskPlanner: VisualTaskPlanner;
  private codeIntelligence: CodeIntelligence;
  private contextManager: SmartContextManager;
  private richOutput: RichOutput;
  private currentPlan?: AutopilotPlan;
  private tools: Map<string, Tool>;
  private options: AutopilotOptions;
  private isRunning: boolean = false;

  constructor(
    provider: LMStudioProvider,
    tools: Map<string, Tool>,
    options: AutopilotOptions = {}
  ) {
    super();
    this.provider = provider;
    this.tools = tools;
    this.taskPlanner = new VisualTaskPlanner();
    this.codeIntelligence = new CodeIntelligence();
    this.contextManager = new SmartContextManager('.lm-assistant');
    this.richOutput = new RichOutput();
    
    this.options = {
      confirmActions: false,
      maxRetries: 3,
      timeoutMinutes: 30,
      parallelExecution: true,
      verbosity: 'normal',
      checkpoints: true,
      ...options
    };
  }

  async startAutopilot(goal: string): Promise<AutopilotPlan> {
    if (this.isRunning) {
      throw new Error('Autopilot is already running');
    }

    this.isRunning = true;
    this.richOutput.title('Autopilot Mode', 'banner');
    this.richOutput.subtitle(`Goal: ${goal}`);
    
    try {
      // Create initial plan
      const plan = await this.createPlan(goal);
      this.currentPlan = plan;
      
      // Display plan
      this.displayPlan(plan);
      
      // Confirm with user if needed
      if (this.options.confirmActions) {
        const confirmed = await this.confirmPlan();
        if (!confirmed) {
          plan.status = 'paused';
          return plan;
        }
      }
      
      // Execute plan
      await this.executePlan(plan);
      
      return plan;
    } finally {
      this.isRunning = false;
    }
  }

  private async createPlan(goal: string): Promise<AutopilotPlan> {
    const planId = `autopilot_${Date.now()}`;
    
    // Use AI to break down the goal into tasks
    const planningPrompt = `You are in AUTOPILOT MODE. Create a detailed execution plan for this goal:
"${goal}"

Analyze the goal and break it down into specific, actionable tasks.
Consider:
1. What type of project/task this is
2. Required steps in logical order
3. Dependencies between tasks
4. Estimated time for each task
5. Potential challenges

Respond with a JSON array of tasks, each with:
{
  "title": "Clear task title",
  "description": "Detailed description of what to do",
  "type": "create|fix|optimize|test|deploy|analyze",
  "dependencies": ["array of task titles this depends on"],
  "estimatedMinutes": number,
  "tools": ["array of tools needed"],
  "checkSuccess": "how to verify this task succeeded"
}`;

    const response = await this.provider.chat([
      { role: 'system', content: 'You are an expert project planner. Create detailed, actionable plans.' },
      { role: 'user', content: planningPrompt }
    ]);

    let taskDefinitions;
    try {
      // Clean response and parse JSON
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        taskDefinitions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found in response');
      }
    } catch (error) {
      // Fallback to a simple plan
      taskDefinitions = this.createFallbackPlan(goal);
    }

    // Create tasks in the planner
    const tasks: Task[] = [];
    const taskMap = new Map<string, Task>();
    
    // First pass: create all tasks
    for (const def of taskDefinitions) {
      const task = this.taskPlanner.createTask({
        title: def.title,
        description: def.description,
        estimatedTime: def.estimatedMinutes || 5
      });
      tasks.push(task);
      taskMap.set(def.title, task);
    }
    
    // Second pass: set up dependencies
    for (let i = 0; i < taskDefinitions.length; i++) {
      const def = taskDefinitions[i];
      const task = tasks[i];
      
      if (def.dependencies && Array.isArray(def.dependencies)) {
        for (const depTitle of def.dependencies) {
          const depTask = taskMap.get(depTitle);
          if (depTask) {
            task.dependencies.push(depTask.id);
          }
        }
      }
    }

    const plan: AutopilotPlan = {
      id: planId,
      goal,
      tasks,
      currentTaskIndex: 0,
      status: 'planning',
      startTime: new Date(),
      results: new Map(),
      errors: []
    };

    return plan;
  }

  private createFallbackPlan(goal: string): any[] {
    // Simple fallback plan based on common patterns
    const goalLower = goal.toLowerCase();
    
    if (goalLower.includes('api') || goalLower.includes('rest')) {
      return [
        {
          title: 'Set up project structure',
          description: 'Create project directory and initialize npm',
          type: 'create',
          estimatedMinutes: 2
        },
        {
          title: 'Install dependencies',
          description: 'Install Express and other required packages',
          type: 'create',
          estimatedMinutes: 3,
          dependencies: ['Set up project structure']
        },
        {
          title: 'Create server file',
          description: 'Create main server file with Express setup',
          type: 'create',
          estimatedMinutes: 5,
          dependencies: ['Install dependencies']
        },
        {
          title: 'Implement routes',
          description: 'Create API routes and handlers',
          type: 'create',
          estimatedMinutes: 10,
          dependencies: ['Create server file']
        },
        {
          title: 'Add middleware',
          description: 'Add error handling and validation middleware',
          type: 'create',
          estimatedMinutes: 5,
          dependencies: ['Implement routes']
        },
        {
          title: 'Create tests',
          description: 'Write unit tests for API endpoints',
          type: 'test',
          estimatedMinutes: 8,
          dependencies: ['Implement routes']
        },
        {
          title: 'Add documentation',
          description: 'Create API documentation',
          type: 'create',
          estimatedMinutes: 5,
          dependencies: ['Implement routes']
        }
      ];
    }
    
    // Generic fallback
    return [
      {
        title: 'Analyze requirements',
        description: 'Understand what needs to be done',
        type: 'analyze',
        estimatedMinutes: 5
      },
      {
        title: 'Create implementation',
        description: 'Implement the main functionality',
        type: 'create',
        estimatedMinutes: 10,
        dependencies: ['Analyze requirements']
      },
      {
        title: 'Test and verify',
        description: 'Ensure everything works correctly',
        type: 'test',
        estimatedMinutes: 5,
        dependencies: ['Create implementation']
      }
    ];
  }

  private displayPlan(plan: AutopilotPlan) {
    this.richOutput.separator();
    this.richOutput.subtitle('Execution Plan');
    
    // Show task list
    const taskData = plan.tasks.map((task, index) => ({
      '#': index + 1,
      Task: task.title,
      Type: task.description.split(' ')[0],
      'Est. Time': `${task.estimatedTime}m`,
      Dependencies: task.dependencies.length
    }));
    
    this.richOutput.table(taskData);
    
    // Show visual plan
    console.log('\n' + this.taskPlanner.visualize());
    
    // Show total time estimate
    const totalTime = plan.tasks.reduce((sum, task) => sum + (task.estimatedTime || 0), 0);
    this.richOutput.info(`Total estimated time: ${totalTime} minutes`);
  }

  private async confirmPlan(): Promise<boolean> {
    // In a real implementation, this would prompt the user
    return true;
  }

  private async executePlan(plan: AutopilotPlan) {
    plan.status = 'executing';
    const startTime = Date.now();
    
    this.richOutput.separator();
    this.richOutput.subtitle('Executing Plan');
    
    if (this.options.parallelExecution) {
      await this.executeParallel(plan);
    } else {
      await this.executeSequential(plan);
    }
    
    // Final summary
    const duration = Math.round((Date.now() - startTime) / 1000 / 60);
    plan.endTime = new Date();
    
    if (plan.errors.length === 0) {
      plan.status = 'completed';
      this.richOutput.success(`Autopilot completed successfully in ${duration} minutes!`);
    } else {
      plan.status = 'failed';
      this.richOutput.error(`Autopilot completed with ${plan.errors.length} errors in ${duration} minutes`);
    }
    
    this.displayResults(plan);
  }

  private async executeSequential(plan: AutopilotPlan) {
    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];
      plan.currentTaskIndex = i;
      
      try {
        await this.executeTask(task, plan);
      } catch (error) {
        plan.errors.push(error as Error);
        
        if (this.options.maxRetries && this.options.maxRetries > 0) {
          for (let retry = 1; retry <= this.options.maxRetries; retry++) {
            this.richOutput.warning(`Retrying task (attempt ${retry}/${this.options.maxRetries})`);
            try {
              await this.executeTask(task, plan);
              break;
            } catch (retryError) {
              if (retry === this.options.maxRetries) {
                plan.errors.push(retryError as Error);
                this.richOutput.error(`Task failed after ${retry} attempts`);
              }
            }
          }
        }
      }
    }
  }

  private async executeParallel(plan: AutopilotPlan) {
    await this.taskPlanner.executeInParallel(async (task) => {
      await this.executeTask(task, plan);
    });
  }

  private async executeTask(task: Task, plan: AutopilotPlan) {
    this.taskPlanner.startTask(task.id);
    
    const spinner = `spinner_${task.id}`;
    this.richOutput.spinner(spinner, `Executing: ${task.title}`);
    
    try {
      // Update context
      this.contextManager.updateCurrentTask([task.title, task.description]);
      
      // Generate execution prompt
      const executionPrompt = `Execute this task in AUTOPILOT MODE:
Task: ${task.title}
Description: ${task.description}
Goal: ${plan.goal}

Previous results: ${JSON.stringify(Array.from(plan.results.entries()))}

You have access to these tools: ${Array.from(this.tools.keys()).join(', ')}

Execute the task step by step. Use tools as needed.
Respond with a JSON object:
{
  "steps": ["array of steps taken"],
  "toolCalls": [{"tool": "name", "params": {}, "result": "summary"}],
  "output": "final output or created content",
  "success": boolean,
  "nextSteps": ["suggested follow-up actions"]
}`;

      const response = await this.provider.chat([
        { role: 'system', content: 'You are in AUTOPILOT MODE. Execute tasks efficiently and report results clearly.' },
        { role: 'user', content: executionPrompt }
      ]);

      // Parse execution result
      let result;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        }
      } catch (error) {
        result = { success: false, error: 'Failed to parse execution result' };
      }

      // Store result
      plan.results.set(task.title, result);
      
      // Update progress
      const progress = result.success ? 100 : 50;
      this.taskPlanner.updateProgress(task.id, progress);
      
      if (result.success) {
        this.taskPlanner.completeTask(task.id);
        this.richOutput.spinner(spinner, `✓ ${task.title}`, 'succeed');
        
        // Store successful solution for future reference
        if (result.output) {
          await this.contextManager.addSolution(task.description, result.output);
        }
      } else {
        this.richOutput.spinner(spinner, `✗ ${task.title}`, 'fail');
        throw new Error(result.error || 'Task execution failed');
      }
      
    } catch (error) {
      this.richOutput.spinner(spinner, `✗ ${task.title}: ${(error as Error).message}`, 'fail');
      throw error;
    }
  }

  private displayResults(plan: AutopilotPlan) {
    this.richOutput.separator();
    this.richOutput.subtitle('Execution Summary');
    
    // Task summary
    const completedTasks = plan.tasks.filter(t => t.status === 'completed').length;
    const failedTasks = plan.tasks.filter(t => t.status === 'blocked' || plan.errors.length > 0).length;
    
    this.richOutput.stats({
      'Total Tasks': plan.tasks.length,
      'Completed': completedTasks,
      'Failed': failedTasks,
      'Success Rate': `${Math.round((completedTasks / plan.tasks.length) * 100)}%`,
      'Duration': plan.endTime ? 
        `${Math.round((plan.endTime.getTime() - plan.startTime.getTime()) / 1000 / 60)} minutes` : 
        'N/A'
    });
    
    // Key outputs
    if (plan.results.size > 0) {
      this.richOutput.separator();
      this.richOutput.subtitle('Key Outputs');
      
      for (const [taskName, result] of plan.results) {
        if (result.output) {
          console.log(chalk.bold.white(`\n${taskName}:`));
          console.log(chalk.gray(this.truncateOutput(result.output, 200)));
        }
      }
    }
    
    // Errors
    if (plan.errors.length > 0) {
      this.richOutput.separator();
      this.richOutput.subtitle('Errors Encountered');
      
      for (const error of plan.errors) {
        this.richOutput.error(`• ${error.message}`);
      }
    }
    
    // Next steps
    const nextSteps = new Set<string>();
    for (const result of plan.results.values()) {
      if (result.nextSteps && Array.isArray(result.nextSteps)) {
        result.nextSteps.forEach((step: string) => nextSteps.add(step));
      }
    }
    
    if (nextSteps.size > 0) {
      this.richOutput.separator();
      this.richOutput.subtitle('Suggested Next Steps');
      this.richOutput.list(Array.from(nextSteps));
    }
  }

  private truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) return output;
    return output.substring(0, maxLength) + '...';
  }

  // Pause autopilot
  pauseAutopilot() {
    if (this.currentPlan && this.currentPlan.status === 'executing') {
      this.currentPlan.status = 'paused';
      this.richOutput.warning('Autopilot paused');
    }
  }

  // Resume autopilot
  async resumeAutopilot() {
    if (this.currentPlan && this.currentPlan.status === 'paused') {
      this.currentPlan.status = 'executing';
      this.richOutput.info('Autopilot resumed');
      await this.executePlan(this.currentPlan);
    }
  }

  // Stop autopilot
  stopAutopilot() {
    this.isRunning = false;
    if (this.currentPlan) {
      this.currentPlan.status = 'paused';
      this.richOutput.error('Autopilot stopped');
    }
  }

  // Get current status
  getStatus(): { isRunning: boolean; plan?: AutopilotPlan } {
    return {
      isRunning: this.isRunning,
      plan: this.currentPlan
    };
  }
}