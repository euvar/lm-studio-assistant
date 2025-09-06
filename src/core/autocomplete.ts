import chalk from 'chalk';

export interface Suggestion {
  text: string;
  description?: string;
  type: 'command' | 'file' | 'tool' | 'history';
}

export class AutoCompleter {
  protected commands: Suggestion[] = [
    { text: 'help', description: 'Show available commands', type: 'command' },
    { text: 'clear', description: 'Clear the screen', type: 'command' },
    { text: 'new', description: 'Start a new conversation', type: 'command' },
    { text: 'history', description: 'Show recent conversations', type: 'command' },
    { text: 'config', description: 'View/edit configuration', type: 'command' },
    { text: 'exit', description: 'Exit the assistant', type: 'command' },
    { text: 'quit', description: 'Exit the assistant', type: 'command' },
  ];

  protected commonPrompts: Suggestion[] = [
    { text: 'Create a file', description: 'Create a new file with content', type: 'tool' },
    { text: 'Edit', description: 'Edit an existing file', type: 'tool' },
    { text: 'Show me', description: 'Read and display file contents', type: 'tool' },
    { text: 'Search for', description: 'Search the web for information', type: 'tool' },
    { text: 'Run', description: 'Execute a bash command', type: 'tool' },
    { text: 'List files in', description: 'List directory contents', type: 'tool' },
    { text: 'Help me debug', description: 'Debug an error or issue', type: 'tool' },
    { text: 'Explain', description: 'Explain code or concepts', type: 'tool' },
  ];

  protected recentInputs: string[] = [];
  protected maxHistory: number = 50;

  addToHistory(input: string): void {
    if (input.trim() && !this.recentInputs.includes(input)) {
      this.recentInputs.unshift(input);
      if (this.recentInputs.length > this.maxHistory) {
        this.recentInputs.pop();
      }
    }
  }

  getSuggestions(input: string): Suggestion[] {
    const lowerInput = input.toLowerCase().trim();
    
    if (!lowerInput) {
      return [...this.commands, ...this.commonPrompts.slice(0, 3)];
    }

    const suggestions: Suggestion[] = [];
    
    // Check commands
    for (const cmd of this.commands) {
      if (cmd.text.toLowerCase().startsWith(lowerInput)) {
        suggestions.push(cmd);
      }
    }

    // Check common prompts
    for (const prompt of this.commonPrompts) {
      if (prompt.text.toLowerCase().includes(lowerInput)) {
        suggestions.push(prompt);
      }
    }

    // Check history
    for (const historyItem of this.recentInputs) {
      if (historyItem.toLowerCase().includes(lowerInput) && 
          !suggestions.find(s => s.text === historyItem)) {
        suggestions.push({
          text: historyItem,
          type: 'history',
          description: 'Recent command',
        });
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  formatSuggestion(suggestion: Suggestion, isSelected: boolean = false): string {
    const icon = {
      command: '⚡',
      file: '📄',
      tool: '🔧',
      history: '⏱️',
    }[suggestion.type] || '•';

    const text = isSelected ? 
      chalk.bgBlue.white(` ${icon} ${suggestion.text} `) : 
      chalk.dim(`${icon} ${suggestion.text}`);
    
    const desc = suggestion.description ? 
      chalk.dim.italic(` - ${suggestion.description}`) : '';
    
    return text + desc;
  }

  async getFileCompletions(partialPath: string): Promise<string[]> {
    // This could be enhanced to actually check the file system
    // For now, return empty array
    return [];
  }
}