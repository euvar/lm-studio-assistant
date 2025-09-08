import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { LMStudioProvider } from '../providers/lmstudio.js';
import { Assistant } from './assistant.js';
import { ConfigManager, DEFAULT_CONFIG } from './config.js';
import { AutoCompleter } from './autocomplete.js';
import autocompletePrompt from 'inquirer-autocomplete-prompt';
import { agentMetrics } from '../utils/agent-metrics.js';
import { performanceMonitor } from '../utils/performance-monitor.js';

export class CLI {
  private provider: LMStudioProvider;
  private assistant: Assistant | null = null;
  private isRunning: boolean = true;
  private config: ConfigManager;
  private autoCompleter: AutoCompleter;

  constructor() {
    this.config = new ConfigManager();
    this.provider = new LMStudioProvider();
    this.autoCompleter = new AutoCompleter();
    
    // Register autocomplete prompt type
    inquirer.registerPrompt('autocomplete', autocompletePrompt);
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\n🤖 LM Studio Assistant\n'));
    
    // Enable performance monitoring if requested
    if (process.env.PERF_MONITOR === 'true') {
      performanceMonitor.enable();
      console.log(chalk.dim('📡 Performance monitoring enabled\n'));
    }

    // Load configuration
    await this.config.load();
    const configData = this.config.get();

    // Update provider with config URL
    this.provider = new LMStudioProvider(configData.lmStudio.url);

    // Connect to LM Studio
    await this.connectToLMStudio();

    // Select model
    await this.selectModel();

    // Create assistant
    this.assistant = new Assistant(this.provider);
    await this.assistant.initialize();

    // Ask about loading previous session (or auto-load based on config)
    if (configData.ui.autoLoadHistory) {
      const loaded = await this.assistant.loadPreviousSession();
      if (loaded) {
        console.log(chalk.green('✓ Previous conversation auto-loaded\n'));
      }
    } else {
      const { loadHistory } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'loadHistory',
          message: 'Load previous conversation?',
          default: false,
        },
      ]);

      if (loadHistory) {
        const loaded = await this.assistant.loadPreviousSession();
        if (loaded) {
          console.log(chalk.green('✓ Previous conversation loaded\n'));
        } else {
          console.log(chalk.yellow('No previous conversation found\n'));
        }
      }
    }

    // Show help
    this.showHelp();

    // Main loop
    while (this.isRunning) {
      const { input } = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'input',
          message: chalk.green('>'),
          prefix: '',
          source: async (_: any, input: string) => {
            const suggestions = await this.autoCompleter.getSuggestions(input || '');
            return suggestions.map((s: any) => ({
              name: this.autoCompleter.formatSuggestion(s),
              value: s.text,
              short: s.text, // Store for selection tracking
            }));
          },
          suggestOnly: true,
          searchText: 'Start typing...',
          emptyText: 'Type your message or command',
        },
      ]);

      if (!input || !input.trim()) continue;

      // Add to autocomplete history
      this.autoCompleter.addToHistory(input);

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        this.isRunning = false;
        console.log(chalk.yellow('\nGoodbye! 👋\n'));
        break;
      }

      if (input.toLowerCase() === 'help') {
        this.showHelp();
        continue;
      }

      if (input.toLowerCase() === 'clear') {
        console.clear();
        continue;
      }

      if (input.toLowerCase() === 'history') {
        await this.showHistory();
        continue;
      }

      if (input.toLowerCase() === 'new') {
        if (this.assistant) {
          this.assistant.clearHistory();
          await this.assistant.initialize();
          console.log(chalk.green('✓ Started new conversation\n'));
        }
        continue;
      }

      if (input.toLowerCase() === 'config') {
        await this.showConfig();
        continue;
      }

      if (input.toLowerCase() === 'verbose') {
        const config = this.config.get();
        config.ui.showToolDetails = !config.ui.showToolDetails;
        await this.config.update(config);
        console.log(chalk.green(`✓ Verbose mode ${config.ui.showToolDetails ? 'enabled' : 'disabled'}\n`));
        continue;
      }

      if (input.toLowerCase() === 'agents') {
        if (this.assistant) {
          console.log(this.assistant.listAgents());
        }
        continue;
      }

      if (input.toLowerCase() === 'checkpoint' || input.toLowerCase() === 'cp') {
        await this.handleCheckpoint();
        continue;
      }

      if (input.toLowerCase() === 'checkpoints' || input.toLowerCase() === 'cps') {
        await this.showCheckpoints();
        continue;
      }

      if (input.toLowerCase().startsWith('branch ')) {
        const branchName = input.substring(7).trim();
        if (branchName) {
          await this.createBranch(branchName);
        } else {
          console.log(chalk.yellow('Please provide a branch name: branch <name>\n'));
        }
        continue;
      }

      if (input.toLowerCase() === 'creative' || input.toLowerCase() === 'creative mode') {
        await this.enterCreativeMode();
        continue;
      }

      if (input.toLowerCase().startsWith('creative ')) {
        const subcommand = input.substring(9).trim().toLowerCase();
        if (subcommand === 'solutions') {
          await this.enterCreativeSolutionMode();
        } else if (subcommand === 'writing') {
          await this.enterCreativeWritingMode();
        } else {
          console.log(chalk.yellow('Available creative modes: writing, solutions\n'));
        }
        continue;
      }

      if (input.toLowerCase().startsWith('plan ')) {
        const taskDescription = input.substring(5).trim();
        if (taskDescription && this.assistant) {
          await this.assistant.planAndExecuteTasks(taskDescription);
        } else {
          console.log(chalk.yellow('Please provide a task description: plan <task>\n'));
        }
        continue;
      }
      
      if (input.toLowerCase() === 'metrics') {
        console.log(agentMetrics.formatReport());
        console.log('');
        continue;
      }
      
      if (input.toLowerCase() === 'performance') {
        console.log(chalk.bold('\n📡 Performance Summary'));
        console.log(performanceMonitor.getSummary());
        console.log('');
        continue;
      }

      if (input.trim()) {
        await this.processInput(input);
      }
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan('Available commands:'));
    console.log(chalk.dim('  help        - Show this help'));
    console.log(chalk.dim('  clear       - Clear the screen'));
    console.log(chalk.dim('  history     - Show conversation history'));
    console.log(chalk.dim('  new         - Start a new conversation'));
    console.log(chalk.dim('  config      - View/edit configuration'));
    console.log(chalk.dim('  verbose     - Toggle verbose mode'));
    console.log(chalk.dim('  agents      - List available agents'));
    console.log(chalk.dim('  checkpoint  - Create a conversation checkpoint'));
    console.log(chalk.dim('  checkpoints - List all checkpoints'));
    console.log(chalk.dim('  branch <name> - Create a new branch from checkpoint'));
    console.log(chalk.dim('  plan <task> - Create and execute a task plan'));
    console.log(chalk.dim('  metrics     - Show agent usage metrics'));
    console.log(chalk.dim('  performance - Show performance statistics'));
    console.log(chalk.dim('  exit        - Exit the assistant'));
    console.log(chalk.dim('\nExample prompts:'));
    console.log(chalk.dim('  "Create a file hello.js with a hello world function"'));
    console.log(chalk.dim('  "Show me the contents of package.json"'));
    console.log(chalk.dim('  "Search for weather in Moscow"'));
    console.log(chalk.dim('  "Analyze this project"'));
    console.log('');
  }

  private async connectToLMStudio(): Promise<void> {
    const spinner = ora('Connecting to LM Studio...').start();

    try {
      const isConnected = await this.provider.testConnection();
      if (isConnected) {
        spinner.succeed('Connected to LM Studio');
      } else {
        throw new Error('Connection failed');
      }
    } catch (error) {
      spinner.fail('Failed to connect to LM Studio');
      console.error(chalk.red('\nMake sure LM Studio is running with a model loaded.'));
      console.error(chalk.dim('LM Studio should be accessible at http://localhost:1234\n'));
      process.exit(1);
    }
  }

  private async selectModel(): Promise<void> {
    const spinner = ora('Fetching available models...').start();

    try {
      const models = await this.provider.getModels();
      spinner.stop();

      if (models.length === 0) {
        console.error(chalk.red('\nNo models found. Please load a model in LM Studio first.\n'));
        process.exit(1);
      }

      const { selectedModel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedModel',
          message: 'Select a model:',
          choices: models.map(m => ({
            name: m.id,
            value: m.id,
          })),
        },
      ]);

      this.provider.setModel(selectedModel);
      console.log(chalk.green(`✓ Using model: ${selectedModel}\n`));
    } catch (error) {
      spinner.fail('Failed to fetch models');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  }

  private async showHistory(): Promise<void> {
    if (!this.assistant) return;
    
    const historyManager = this.assistant.getHistoryManager();
    const sessions = await historyManager.listSessions();
    
    if (sessions.length === 0) {
      console.log(chalk.yellow('No conversation history found.\n'));
      return;
    }

    console.log(chalk.cyan('\nRecent conversations:'));
    sessions.forEach((session, index) => {
      const date = session.replace('session-', '').replace('.json', '').replace(/T/g, ' ');
      console.log(chalk.dim(`  ${index + 1}. ${date}`));
    });
    console.log('');
  }

  private async showConfig(): Promise<void> {
    const config = this.config.get();
    
    console.log(chalk.cyan('\nCurrent Configuration:'));
    console.log(chalk.dim(JSON.stringify(config, null, 2)));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Edit configuration', value: 'edit' },
          { name: 'Reset to defaults', value: 'reset' },
          { name: 'Back to chat', value: 'back' },
        ],
      },
    ]);

    if (action === 'edit') {
      console.log(chalk.yellow(`\nConfiguration file location: ${this.config.getConfigPath()}`));
      console.log(chalk.dim('Edit this file with your favorite text editor and restart the assistant.'));
    } else if (action === 'reset') {
      await this.config.update(DEFAULT_CONFIG);
      console.log(chalk.green('✓ Configuration reset to defaults\n'));
    }
    
    console.log('');
  }

  private async processInput(input: string): Promise<void> {
    if (!this.assistant) return;

    const config = this.config.get();
    
    // Update autocompleter context - removed as not supported by basic autocompleter
    
    console.log(chalk.cyan('\nAssistant:'));
    
    try {
      // Use streaming if enabled
      if (config.ui.streamingEnabled !== false) {
        let isFirstToken = true;
        let currentLine = '';
        
        for await (const token of this.assistant.chatStream(input)) {
          if (isFirstToken) {
            isFirstToken = false;
          }
          
          // Handle newlines properly
          currentLine += token;
          if (token.includes('\n')) {
            process.stdout.write(currentLine);
            currentLine = '';
          } else if (currentLine.length > 80) {
            // Wrap long lines
            process.stdout.write(currentLine);
            currentLine = '';
          }
        }
        
        // Write any remaining content
        if (currentLine) {
          process.stdout.write(currentLine);
        }
        console.log('\n');
      } else {
        // Fallback to non-streaming
        const spinner = ora({
          text: 'Thinking...',
          spinner: 'dots',
        }).start();
        
        const response = await this.assistant.chat(input);
        spinner.stop();
        
        if (response) {
          console.log(response);
          console.log('');
        }
      }
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      console.log('');
    }
  }

  private async handleCheckpoint(): Promise<void> {
    if (!this.assistant) return;

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Create checkpoint', value: 'create' },
          { name: 'Load checkpoint', value: 'load' },
          { name: 'List checkpoints', value: 'list' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'create') {
      const { name, description } = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Checkpoint name:',
          validate: (input) => input.length > 0 || 'Name is required',
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description (optional):',
        },
      ]);

      try {
        const checkpointId = await this.assistant.createCheckpoint(name, description || undefined);
        console.log(chalk.green(`✓ Created checkpoint: ${checkpointId}\n`));
      } catch (error) {
        console.error(chalk.red('Failed to create checkpoint:', error));
      }
    } else if (action === 'load') {
      await this.loadCheckpoint();
    } else if (action === 'list') {
      await this.showCheckpoints();
    }
  }

  private async showCheckpoints(): Promise<void> {
    if (!this.assistant) return;
    
    try {
      const tree = await this.assistant.listCheckpoints();
      console.log(tree);
    } catch (error) {
      console.log(chalk.yellow('No checkpoints found.\n'));
    }
  }

  private async loadCheckpoint(): Promise<void> {
    if (!this.assistant) return;

    // Get available checkpoints
    const tree = await this.assistant.listCheckpoints();
    if (!tree || tree.includes('No checkpoints')) {
      console.log(chalk.yellow('No checkpoints available.\n'));
      return;
    }

    const { checkpointId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'checkpointId',
        message: 'Enter checkpoint ID to load:',
        validate: (input) => input.length > 0 || 'Checkpoint ID is required',
      },
    ]);

    try {
      const loaded = await this.assistant.loadCheckpoint(checkpointId);
      if (loaded) {
        console.log(chalk.green(`✓ Loaded checkpoint: ${checkpointId}\n`));
      } else {
        console.log(chalk.red('Failed to load checkpoint.\n'));
      }
    } catch (error) {
      console.error(chalk.red('Error loading checkpoint:', error));
    }
  }

  private async createBranch(branchName: string): Promise<void> {
    if (!this.assistant) return;

    // Show checkpoint tree
    const tree = await this.assistant.listCheckpoints();
    console.log(tree);

    const { checkpointId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'checkpointId',
        message: 'Enter checkpoint ID to branch from:',
        validate: (input) => input.length > 0 || 'Checkpoint ID is required',
      },
    ]);

    try {
      const branchId = await this.assistant.branchFromCheckpoint(checkpointId, branchName);
      console.log(chalk.green(`✓ Created branch "${branchName}" from checkpoint ${checkpointId}`));
      console.log(chalk.green(`✓ Now on branch: ${branchId}\n`));
    } catch (error) {
      console.error(chalk.red('Failed to create branch:', error));
    }
  }
  
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private async enterCreativeMode() {
    console.log(chalk.magenta('\n✨ Choose Creative Mode:\n'));
    console.log(chalk.dim('1. Creative Writing - Stories, poems, scripts, and more'));
    console.log(chalk.dim('2. Creative Solutions - Multiple approaches to problems\n'));
    
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: 'Select mode:',
      choices: [
        { name: 'Creative Writing', value: 'writing' },
        { name: 'Creative Solutions', value: 'solutions' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }]);

    if (choice === 'writing') {
      await this.enterCreativeWritingMode();
    } else if (choice === 'solutions') {
      await this.enterCreativeSolutionMode();
    }
  }

  private async enterCreativeWritingMode() {
    if (!this.assistant) return;

    const writingMode = this.assistant.getCreativeWritingMode();
    
    const { style } = await inquirer.prompt([{
      type: 'list',
      name: 'style',
      message: 'What would you like to create?',
      choices: [
        { name: '📖 Story - Short stories or chapters', value: 'story' },
        { name: '📝 Poem - Various poetic forms', value: 'poem' },
        { name: '🎭 Script - Screenplays or stage plays', value: 'script' },
        { name: '📄 Essay - Formal or informal essays', value: 'essay' },
        { name: '💬 Dialogue - Character conversations', value: 'dialogue' },
        { name: '🎵 Lyrics - Song lyrics', value: 'lyrics' },
        { name: '✨ Free Writing - Any creative form', value: 'free' }
      ]
    }]);

    writingMode.activate({ style });

    // Enter creative writing loop
    while (writingMode.isWritingMode()) {
      const { input } = await inquirer.prompt([{
        type: 'input',
        name: 'input',
        message: chalk.magenta('✨'),
        prefix: ''
      }]);

      if (!input.trim()) continue;

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        writingMode.deactivate();
        break;
      }

      if (input.toLowerCase() === 'continue') {
        await writingMode.continueWriting();
      } else if (input.toLowerCase() === 'rewrite') {
        await writingMode.rewriteLastPiece();
      } else if (input.toLowerCase() === 'sessions') {
        const sessions = writingMode.getSessions();
        console.log(chalk.cyan('\n📚 Writing Sessions:'));
        sessions.forEach(s => {
          console.log(chalk.dim(`- ${s.title} (${s.metadata.totalWords} words)`));
        });
        console.log('');
      } else {
        // Generate new content
        await writingMode.generate({
          type: 'generate',
          input,
          options: { style }
        });
      }
    }
  }

  private async enterCreativeSolutionMode() {
    if (!this.assistant) return;

    const solutionMode = this.assistant.getCreativeSolutionMode();
    
    console.log(chalk.magenta('\n🧠 Creative Solutions Mode\n'));
    console.log(chalk.dim('Describe your problem or challenge, and I\'ll generate multiple creative solutions.\n'));

    const { problem } = await inquirer.prompt([{
      type: 'input',
      name: 'problem',
      message: 'Describe the problem:',
      validate: input => input.trim().length > 0
    }]);

    const { constraints } = await inquirer.prompt([{
      type: 'input',
      name: 'constraints',
      message: 'Any constraints? (optional, comma-separated):'
    }]);

    const constraintList = constraints ? constraints.split(',').map((c: string) => c.trim()) : [];

    await solutionMode.generateSolutions({
      problem,
      constraints: constraintList
    });
  }
}