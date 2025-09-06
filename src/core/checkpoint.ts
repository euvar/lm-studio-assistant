import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { ChatMessage } from '../providers/lmstudio.js';

export interface ConversationCheckpoint {
  id: string;
  name: string;
  description?: string;
  timestamp: string;
  messages: ChatMessage[];
  branches?: string[]; // IDs of branches from this checkpoint
  parentId?: string; // ID of parent checkpoint if this is a branch
}

export class CheckpointManager {
  private checkpointsDir: string;
  private currentCheckpointId?: string;

  constructor() {
    this.checkpointsDir = path.join(os.homedir(), '.lm-assistant', 'checkpoints');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.checkpointsDir, { recursive: true });
  }

  async createCheckpoint(
    messages: ChatMessage[],
    name: string,
    description?: string,
    parentId?: string
  ): Promise<string> {
    const id = `chk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const checkpoint: ConversationCheckpoint = {
      id,
      name,
      description,
      timestamp: new Date().toISOString(),
      messages: [...messages],
      branches: [],
      parentId,
    };

    // Update parent checkpoint if this is a branch
    if (parentId) {
      const parent = await this.loadCheckpoint(parentId);
      if (parent) {
        parent.branches = parent.branches || [];
        parent.branches.push(id);
        await this.saveCheckpoint(parent);
      }
    }

    await this.saveCheckpoint(checkpoint);
    this.currentCheckpointId = id;
    return id;
  }

  private async saveCheckpoint(checkpoint: ConversationCheckpoint): Promise<void> {
    const filePath = path.join(this.checkpointsDir, `${checkpoint.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  }

  async loadCheckpoint(id: string): Promise<ConversationCheckpoint | null> {
    try {
      const filePath = path.join(this.checkpointsDir, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async listCheckpoints(): Promise<ConversationCheckpoint[]> {
    try {
      const files = await fs.readdir(this.checkpointsDir);
      const checkpoints: ConversationCheckpoint[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const checkpoint = await this.loadCheckpoint(file.replace('.json', ''));
          if (checkpoint) {
            checkpoints.push(checkpoint);
          }
        }
      }

      return checkpoints.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  async deleteCheckpoint(id: string): Promise<boolean> {
    try {
      const filePath = path.join(this.checkpointsDir, `${id}.json`);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getCheckpointTree(): Promise<string> {
    const checkpoints = await this.listCheckpoints();
    const rootCheckpoints = checkpoints.filter(c => !c.parentId);
    
    let tree = chalk.cyan('\nConversation Tree:\n');
    
    const renderBranch = (checkpoint: ConversationCheckpoint, indent: string = ''): string => {
      let result = `${indent}${checkpoint.id === this.currentCheckpointId ? chalk.green('●') : '○'} `;
      result += chalk.bold(checkpoint.name);
      if (checkpoint.description) {
        result += chalk.dim(` - ${checkpoint.description}`);
      }
      result += chalk.dim(` (${new Date(checkpoint.timestamp).toLocaleString()})`);
      result += '\n';

      if (checkpoint.branches && checkpoint.branches.length > 0) {
        checkpoint.branches.forEach((branchId, index) => {
          const branch = checkpoints.find(c => c.id === branchId);
          if (branch) {
            const isLast = index === checkpoint.branches!.length - 1;
            const branchIndent = indent + (isLast ? '  └── ' : '  ├── ');
            const childIndent = indent + (isLast ? '      ' : '  │   ');
            result += renderBranch(branch, branchIndent).replace(branchIndent, branchIndent);
            
            // Render sub-branches with proper indentation
            if (branch.branches && branch.branches.length > 0) {
              const subBranches = renderBranch(branch, childIndent);
              result += subBranches.split('\n').slice(1).join('\n');
            }
          }
        });
      }
      
      return result;
    };

    rootCheckpoints.forEach(checkpoint => {
      tree += renderBranch(checkpoint);
    });

    return tree;
  }

  getCurrentCheckpointId(): string | undefined {
    return this.currentCheckpointId;
  }

  setCurrentCheckpointId(id: string): void {
    this.currentCheckpointId = id;
  }
}