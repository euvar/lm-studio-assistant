import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface GitHook {
    name: string;
    script: string;
    enabled: boolean;
    aiAssisted?: boolean;
}

export interface GitHookConfig {
    preCommit?: GitHook;
    prePush?: GitHook;
    postCommit?: GitHook;
    commitMsg?: GitHook;
    preRebase?: GitHook;
}

export class GitHooksManager extends EventEmitter {
    private gitDir: string = '.git';
    private hooksDir: string = path.join(this.gitDir, 'hooks');
    private configFile: string = '.lm-assistant-hooks.json';
    private hooks: GitHookConfig = {};
    private isActive: boolean = false;
    
    constructor(private assistantProvider?: any) {
        super();
    }
    
    async initialize(): Promise<void> {
        // Check if in git repository
        try {
            await fs.access(this.gitDir);
        } catch {
            console.log('Not in a git repository - Git hooks will be disabled');
            this.isActive = false;
            return;
        }
        
        // Ensure hooks directory exists
        await fs.mkdir(this.hooksDir, { recursive: true });
        
        // Load existing configuration
        await this.loadConfig();
        this.isActive = true;
    }
    
    private async loadConfig(): Promise<void> {
        try {
            const configContent = await fs.readFile(this.configFile, 'utf-8');
            this.hooks = JSON.parse(configContent);
        } catch {
            // Default configuration
            this.hooks = {
                preCommit: {
                    name: 'pre-commit',
                    script: this.getDefaultPreCommitScript(),
                    enabled: false,
                    aiAssisted: true
                },
                commitMsg: {
                    name: 'commit-msg',
                    script: this.getDefaultCommitMsgScript(),
                    enabled: false,
                    aiAssisted: true
                },
                prePush: {
                    name: 'pre-push',
                    script: this.getDefaultPrePushScript(),
                    enabled: false,
                    aiAssisted: false
                }
            };
        }
    }
    
    async saveConfig(): Promise<void> {
        await fs.writeFile(this.configFile, JSON.stringify(this.hooks, null, 2));
    }
    
    async enableHook(hookName: string): Promise<void> {
        const hook = this.getHookByName(hookName);
        if (!hook) {
            throw new Error(`Unknown hook: ${hookName}`);
        }
        
        hook.enabled = true;
        await this.installHook(hook);
        await this.saveConfig();
        
        this.emit('hookEnabled', hookName);
        console.log(chalk.green(`✅ Enabled git hook: ${hookName}`));
    }
    
    async disableHook(hookName: string): Promise<void> {
        const hook = this.getHookByName(hookName);
        if (!hook) {
            throw new Error(`Unknown hook: ${hookName}`);
        }
        
        hook.enabled = false;
        await this.uninstallHook(hook);
        await this.saveConfig();
        
        this.emit('hookDisabled', hookName);
        console.log(chalk.yellow(`⚠️ Disabled git hook: ${hookName}`));
    }
    
    async updateHookScript(hookName: string, script: string): Promise<void> {
        const hook = this.getHookByName(hookName);
        if (!hook) {
            throw new Error(`Unknown hook: ${hookName}`);
        }
        
        hook.script = script;
        if (hook.enabled) {
            await this.installHook(hook);
        }
        await this.saveConfig();
        
        this.emit('hookUpdated', hookName);
    }
    
    private async installHook(hook: GitHook): Promise<void> {
        const hookPath = path.join(this.hooksDir, hook.name);
        
        // Create hook script with shebang
        let hookContent = '#!/bin/sh\n\n';
        
        // Add LM Assistant integration if AI-assisted
        if (hook.aiAssisted && this.assistantProvider) {
            hookContent += `# LM Assistant AI-Assisted Hook\n`;
            hookContent += `# This hook is enhanced with AI assistance\n\n`;
        }
        
        hookContent += hook.script;
        
        // Write hook file
        await fs.writeFile(hookPath, hookContent);
        
        // Make executable
        await fs.chmod(hookPath, '755');
    }
    
    private async uninstallHook(hook: GitHook): Promise<void> {
        const hookPath = path.join(this.hooksDir, hook.name);
        
        try {
            await fs.unlink(hookPath);
        } catch {
            // Hook might not exist
        }
    }
    
    private getHookByName(name: string): GitHook | undefined {
        return Object.values(this.hooks).find(hook => hook?.name === name);
    }
    
    async listHooks(): Promise<GitHook[]> {
        return Object.values(this.hooks).filter(hook => hook !== undefined) as GitHook[];
    }
    
    // AI-Assisted hook functions
    async generateCommitMessage(stagedChanges: string): Promise<string> {
        if (!this.assistantProvider) {
            return '';
        }
        
        const prompt = `Based on these staged changes, generate a concise, descriptive commit message following conventional commit format:\n\n${stagedChanges}`;
        
        try {
            const response = await this.assistantProvider.chat([
                { role: 'system', content: 'You are a commit message generator. Create clear, concise commit messages following conventional commit format (type: description).' },
                { role: 'user', content: prompt }
            ]);
            
            return response.trim();
        } catch (error) {
            console.error('Failed to generate commit message:', error);
            return '';
        }
    }
    
    async analyzeCode(files: string[]): Promise<{ issues: string[], suggestions: string[] }> {
        if (!this.assistantProvider) {
            return { issues: [], suggestions: [] };
        }
        
        // Read file contents
        const fileContents: string[] = [];
        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                fileContents.push(`File: ${file}\n${content}`);
            } catch {
                // Skip files that can't be read
            }
        }
        
        const prompt = `Analyze the following code for potential issues, best practices, and improvements:\n\n${fileContents.join('\n\n')}`;
        
        try {
            const response = await this.assistantProvider.chat([
                { role: 'system', content: 'You are a code reviewer. Identify issues and suggest improvements.' },
                { role: 'user', content: prompt }
            ]);
            
            // Parse response to extract issues and suggestions
            const lines = response.split('\n');
            const issues: string[] = [];
            const suggestions: string[] = [];
            
            let currentSection = '';
            for (const line of lines) {
                if (line.toLowerCase().includes('issue')) {
                    currentSection = 'issues';
                } else if (line.toLowerCase().includes('suggestion')) {
                    currentSection = 'suggestions';
                } else if (line.trim() && line.startsWith('-')) {
                    if (currentSection === 'issues') {
                        issues.push(line.substring(1).trim());
                    } else if (currentSection === 'suggestions') {
                        suggestions.push(line.substring(1).trim());
                    }
                }
            }
            
            return { issues, suggestions };
        } catch (error) {
            console.error('Failed to analyze code:', error);
            return { issues: [], suggestions: [] };
        }
    }
    
    // Default hook scripts
    private getDefaultPreCommitScript(): string {
        return `# Pre-commit hook
# Run tests and linters before committing

# Run tests
if [ -f "package.json" ]; then
    npm test || exit 1
fi

# Run linter
if [ -f "package.json" ]; then
    npm run lint || exit 1
fi

# Check for console.log statements
if git diff --cached --name-only | grep -E '\.(js|ts)$' | xargs grep -l 'console\.log'; then
    echo "⚠️  Warning: console.log statements found in staged files"
    # Uncomment to block commit: exit 1
fi

exit 0`;
    }
    
    private getDefaultCommitMsgScript(): string {
        return `# Commit message hook
# Validate and optionally enhance commit messages

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat $COMMIT_MSG_FILE)

# Check commit message format
if ! echo "$COMMIT_MSG" | grep -qE '^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .{1,}'; then
    echo "❌ Commit message does not follow conventional format!"
    echo "Format: <type>(<scope>): <subject>"
    echo "Example: feat(auth): add OAuth2 support"
    exit 1
fi

# Add issue references if found
BRANCH_NAME=$(git branch --show-current)
if echo "$BRANCH_NAME" | grep -qE '(feature|fix)/([A-Z]+-[0-9]+)'; then
    ISSUE_ID=$(echo "$BRANCH_NAME" | grep -oE '[A-Z]+-[0-9]+')
    if ! echo "$COMMIT_MSG" | grep -q "$ISSUE_ID"; then
        echo "$COMMIT_MSG" > $COMMIT_MSG_FILE
        echo "" >> $COMMIT_MSG_FILE
        echo "Ref: $ISSUE_ID" >> $COMMIT_MSG_FILE
    fi
fi

exit 0`;
    }
    
    private getDefaultPrePushScript(): string {
        return `# Pre-push hook
# Run final checks before pushing

# Ensure all tests pass
if [ -f "package.json" ]; then
    echo "Running tests before push..."
    npm test || {
        echo "❌ Tests failed! Push aborted."
        exit 1
    }
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️  Warning: You have uncommitted changes"
    read -p "Continue with push? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

exit 0`;
    }
    
    // Utility functions
    async getStagedFiles(): Promise<string[]> {
        try {
            const { stdout } = await execAsync('git diff --cached --name-only');
            return stdout.trim().split('\n').filter(file => file.length > 0);
        } catch {
            return [];
        }
    }
    
    async getStagedChanges(): Promise<string> {
        try {
            const { stdout } = await execAsync('git diff --cached');
            return stdout;
        } catch {
            return '';
        }
    }
}

export class GitHooksCommand {
    constructor(private manager: GitHooksManager) {}
    
    async execute(action: string, ...args: string[]): Promise<void> {
        switch (action) {
            case 'list':
                await this.listHooks();
                break;
                
            case 'enable':
                if (args.length < 1) {
                    console.error('Usage: git-hooks enable <hook-name>');
                    return;
                }
                await this.manager.enableHook(args[0]);
                break;
                
            case 'disable':
                if (args.length < 1) {
                    console.error('Usage: git-hooks disable <hook-name>');
                    return;
                }
                await this.manager.disableHook(args[0]);
                break;
                
            case 'generate-commit':
                await this.generateCommitMessage();
                break;
                
            case 'analyze':
                await this.analyzeStaged();
                break;
                
            default:
                console.error(`Unknown action: ${action}`);
                console.log('Available actions: list, enable, disable, generate-commit, analyze');
        }
    }
    
    private async listHooks(): Promise<void> {
        const hooks = await this.manager.listHooks();
        
        console.log(chalk.bold('\n🪝 Git Hooks Configuration:\n'));
        
        for (const hook of hooks) {
            const status = hook.enabled ? chalk.green('✅ Enabled') : chalk.gray('⭕ Disabled');
            const ai = hook.aiAssisted ? chalk.cyan(' [AI-Assisted]') : '';
            console.log(`${status} ${chalk.bold(hook.name)}${ai}`);
        }
        
        console.log(chalk.gray('\nUse "git-hooks enable/disable <hook-name>" to manage hooks'));
    }
    
    private async generateCommitMessage(): Promise<void> {
        const changes = await this.manager.getStagedChanges();
        if (!changes) {
            console.error('No staged changes found');
            return;
        }
        
        console.log(chalk.cyan('🤖 Generating commit message...'));
        const message = await this.manager.generateCommitMessage(changes);
        
        if (message) {
            console.log(chalk.green('\nSuggested commit message:'));
            console.log(chalk.bold(message));
            console.log(chalk.gray('\nUse: git commit -m "' + message + '"'));
        } else {
            console.error('Failed to generate commit message');
        }
    }
    
    private async analyzeStaged(): Promise<void> {
        const files = await this.manager.getStagedFiles();
        if (files.length === 0) {
            console.error('No staged files found');
            return;
        }
        
        console.log(chalk.cyan('🔍 Analyzing staged files...'));
        const { issues, suggestions } = await this.manager.analyzeCode(files);
        
        if (issues.length > 0) {
            console.log(chalk.red('\n❌ Issues found:'));
            issues.forEach(issue => console.log(`  - ${issue}`));
        }
        
        if (suggestions.length > 0) {
            console.log(chalk.yellow('\n💡 Suggestions:'));
            suggestions.forEach(suggestion => console.log(`  - ${suggestion}`));
        }
        
        if (issues.length === 0 && suggestions.length === 0) {
            console.log(chalk.green('\n✅ No issues found!'));
        }
    }
}