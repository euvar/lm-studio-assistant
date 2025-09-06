import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationCheckpoint {
  id: string;
  name: string;
  description?: string;
  timestamp: Date;
  conversationHistory: any[];
  context: any;
  parentId?: string;
  children: string[];
  metadata: {
    model?: string;
    tokenCount?: number;
    tags?: string[];
  };
}

export interface CheckpointTree {
  root: ConversationCheckpoint;
  nodes: Map<string, ConversationCheckpoint>;
  current: string;
}

export class CheckpointManager extends EventEmitter {
  private checkpointPath: string;
  private tree: CheckpointTree | null = null;
  private checkpoints: Map<string, ConversationCheckpoint> = new Map();

  constructor(basePath: string = '.lm-assistant') {
    super();
    this.checkpointPath = path.join(basePath, 'checkpoints');
    this.initialize();
  }

  private async initialize() {
    try {
      await fs.mkdir(this.checkpointPath, { recursive: true });
      await this.loadCheckpoints();
    } catch (error) {
      console.error('Failed to initialize checkpoint manager:', error);
    }
  }

  // Create a new checkpoint
  async createCheckpoint(
    name: string,
    conversationHistory: any[],
    context: any,
    description?: string
  ): Promise<ConversationCheckpoint> {
    const checkpoint: ConversationCheckpoint = {
      id: uuidv4(),
      name,
      description,
      timestamp: new Date(),
      conversationHistory: [...conversationHistory],
      context: { ...context },
      children: [],
      metadata: {
        tokenCount: this.calculateTokens(conversationHistory),
        tags: []
      }
    };

    // If there's a current checkpoint, set it as parent
    if (this.tree && this.tree.current) {
      checkpoint.parentId = this.tree.current;
      const parent = this.checkpoints.get(this.tree.current);
      if (parent) {
        parent.children.push(checkpoint.id);
        await this.saveCheckpoint(parent);
      }
    }

    // Save checkpoint
    await this.saveCheckpoint(checkpoint);
    this.checkpoints.set(checkpoint.id, checkpoint);

    // Update tree
    if (!this.tree) {
      this.tree = {
        root: checkpoint,
        nodes: new Map([[checkpoint.id, checkpoint]]),
        current: checkpoint.id
      };
    } else {
      this.tree.nodes.set(checkpoint.id, checkpoint);
      this.tree.current = checkpoint.id;
    }

    this.emit('checkpointCreated', checkpoint);
    return checkpoint;
  }

  // Load checkpoint
  async loadCheckpoint(id: string): Promise<ConversationCheckpoint | null> {
    if (this.checkpoints.has(id)) {
      return this.checkpoints.get(id)!;
    }

    try {
      const filePath = path.join(this.checkpointPath, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(data);
      checkpoint.timestamp = new Date(checkpoint.timestamp);
      
      this.checkpoints.set(id, checkpoint);
      return checkpoint;
    } catch (error) {
      return null;
    }
  }

  // Save checkpoint to disk
  private async saveCheckpoint(checkpoint: ConversationCheckpoint) {
    const filePath = path.join(this.checkpointPath, `${checkpoint.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
  }

  // Load all checkpoints
  private async loadCheckpoints() {
    try {
      const files = await fs.readdir(this.checkpointPath);
      const checkpointFiles = files.filter(f => f.endsWith('.json'));

      for (const file of checkpointFiles) {
        const id = file.replace('.json', '');
        await this.loadCheckpoint(id);
      }

      // Rebuild tree
      this.rebuildTree();
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
    }
  }

  // Rebuild tree from loaded checkpoints
  private rebuildTree() {
    if (this.checkpoints.size === 0) return;

    // Find root (checkpoint with no parent)
    let root: ConversationCheckpoint | null = null;
    for (const checkpoint of this.checkpoints.values()) {
      if (!checkpoint.parentId) {
        root = checkpoint;
        break;
      }
    }

    if (!root) {
      // If no root found, use the oldest checkpoint
      root = Array.from(this.checkpoints.values())
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
    }

    this.tree = {
      root,
      nodes: new Map(this.checkpoints),
      current: root.id
    };
  }

  // Branch from a checkpoint
  async branchFrom(
    checkpointId: string,
    name: string,
    description?: string
  ): Promise<ConversationCheckpoint | null> {
    const parent = await this.loadCheckpoint(checkpointId);
    if (!parent) return null;

    const branch = await this.createCheckpoint(
      name,
      parent.conversationHistory,
      parent.context,
      description
    );

    branch.parentId = checkpointId;
    parent.children.push(branch.id);

    await this.saveCheckpoint(parent);
    await this.saveCheckpoint(branch);

    this.emit('branchCreated', branch, parent);
    return branch;
  }

  // Switch to a checkpoint
  async switchTo(checkpointId: string): Promise<ConversationCheckpoint | null> {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    if (!checkpoint) return null;

    if (this.tree) {
      this.tree.current = checkpointId;
    }

    this.emit('checkpointSwitched', checkpoint);
    return checkpoint;
  }

  // Get checkpoint tree visualization
  getTreeVisualization(): string {
    if (!this.tree) return 'No checkpoints';

    const lines: string[] = ['Checkpoint Tree:\n'];
    this.visualizeNode(this.tree.root, lines, '', true);
    
    return lines.join('\n');
  }

  private visualizeNode(
    node: ConversationCheckpoint,
    lines: string[],
    prefix: string,
    isLast: boolean
  ) {
    const connector = isLast ? '└── ' : '├── ';
    const isCurrent = this.tree?.current === node.id;
    const marker = isCurrent ? ' ★' : '';
    
    lines.push(
      prefix + connector + 
      `${node.name} (${node.timestamp.toLocaleString()})${marker}`
    );

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    
    for (let i = 0; i < node.children.length; i++) {
      const childId = node.children[i];
      const child = this.checkpoints.get(childId);
      if (child) {
        this.visualizeNode(
          child,
          lines,
          childPrefix,
          i === node.children.length - 1
        );
      }
    }
  }

  // Delete checkpoint
  async deleteCheckpoint(id: string): Promise<boolean> {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) return false;

    // Don't delete if it has children
    if (checkpoint.children.length > 0) {
      throw new Error('Cannot delete checkpoint with children');
    }

    // Remove from parent's children
    if (checkpoint.parentId) {
      const parent = this.checkpoints.get(checkpoint.parentId);
      if (parent) {
        parent.children = parent.children.filter(childId => childId !== id);
        await this.saveCheckpoint(parent);
      }
    }

    // Delete file
    const filePath = path.join(this.checkpointPath, `${id}.json`);
    await fs.unlink(filePath);

    // Remove from memory
    this.checkpoints.delete(id);
    if (this.tree) {
      this.tree.nodes.delete(id);
      
      // If this was current, switch to parent or root
      if (this.tree.current === id) {
        this.tree.current = checkpoint.parentId || this.tree.root.id;
      }
    }

    this.emit('checkpointDeleted', id);
    return true;
  }

  // Merge checkpoints
  async mergeCheckpoints(
    sourceId: string,
    targetId: string,
    strategy: 'combine' | 'replace' = 'combine'
  ): Promise<ConversationCheckpoint | null> {
    const source = await this.loadCheckpoint(sourceId);
    const target = await this.loadCheckpoint(targetId);
    
    if (!source || !target) return null;

    let mergedHistory: any[];
    let mergedContext: any;

    if (strategy === 'combine') {
      // Combine histories, removing duplicates
      const historyMap = new Map();
      [...target.conversationHistory, ...source.conversationHistory].forEach(msg => {
        const key = JSON.stringify(msg);
        historyMap.set(key, msg);
      });
      mergedHistory = Array.from(historyMap.values());
      
      // Merge contexts
      mergedContext = {
        ...target.context,
        ...source.context,
        merged: true,
        mergedFrom: [sourceId, targetId]
      };
    } else {
      // Replace target with source
      mergedHistory = source.conversationHistory;
      mergedContext = source.context;
    }

    const merged = await this.createCheckpoint(
      `Merged: ${source.name} + ${target.name}`,
      mergedHistory,
      mergedContext,
      `Merged from ${source.name} and ${target.name}`
    );

    this.emit('checkpointsMerged', merged, source, target);
    return merged;
  }

  // Export checkpoint
  async exportCheckpoint(id: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const checkpoint = await this.loadCheckpoint(id);
    if (!checkpoint) throw new Error('Checkpoint not found');

    if (format === 'json') {
      return JSON.stringify(checkpoint, null, 2);
    } else {
      // Export as markdown
      let markdown = `# Checkpoint: ${checkpoint.name}\n\n`;
      markdown += `**Created:** ${checkpoint.timestamp.toLocaleString()}\n`;
      markdown += `**ID:** ${checkpoint.id}\n`;
      
      if (checkpoint.description) {
        markdown += `\n## Description\n${checkpoint.description}\n`;
      }
      
      markdown += `\n## Conversation History\n\n`;
      for (const msg of checkpoint.conversationHistory) {
        markdown += `### ${msg.role}\n${msg.content}\n\n`;
      }
      
      if (checkpoint.metadata.tags && checkpoint.metadata.tags.length > 0) {
        markdown += `\n## Tags\n${checkpoint.metadata.tags.join(', ')}\n`;
      }
      
      return markdown;
    }
  }

  // Import checkpoint
  async importCheckpoint(data: string, format: 'json' | 'markdown' = 'json'): Promise<ConversationCheckpoint> {
    let checkpoint: ConversationCheckpoint;
    
    if (format === 'json') {
      checkpoint = JSON.parse(data);
      checkpoint.timestamp = new Date(checkpoint.timestamp);
    } else {
      throw new Error('Markdown import not yet implemented');
    }
    
    // Generate new ID to avoid conflicts
    checkpoint.id = uuidv4();
    checkpoint.children = [];
    delete checkpoint.parentId;
    
    await this.saveCheckpoint(checkpoint);
    this.checkpoints.set(checkpoint.id, checkpoint);
    
    this.emit('checkpointImported', checkpoint);
    return checkpoint;
  }

  // Search checkpoints
  searchCheckpoints(query: string): ConversationCheckpoint[] {
    const results: ConversationCheckpoint[] = [];
    const queryLower = query.toLowerCase();
    
    for (const checkpoint of this.checkpoints.values()) {
      if (
        checkpoint.name.toLowerCase().includes(queryLower) ||
        checkpoint.description?.toLowerCase().includes(queryLower) ||
        checkpoint.metadata.tags?.some(tag => tag.toLowerCase().includes(queryLower))
      ) {
        results.push(checkpoint);
      }
    }
    
    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Add tag to checkpoint
  async addTag(checkpointId: string, tag: string): Promise<boolean> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return false;
    
    if (!checkpoint.metadata.tags) {
      checkpoint.metadata.tags = [];
    }
    
    if (!checkpoint.metadata.tags.includes(tag)) {
      checkpoint.metadata.tags.push(tag);
      await this.saveCheckpoint(checkpoint);
      this.emit('tagAdded', checkpointId, tag);
    }
    
    return true;
  }

  // Get all checkpoints
  getAllCheckpoints(): ConversationCheckpoint[] {
    return Array.from(this.checkpoints.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Get current checkpoint
  getCurrentCheckpoint(): ConversationCheckpoint | null {
    if (!this.tree) return null;
    return this.checkpoints.get(this.tree.current) || null;
  }

  // Calculate approximate token count
  private calculateTokens(history: any[]): number {
    // Simple approximation: 1 token ≈ 4 characters
    const totalChars = history.reduce((sum, msg) => {
      return sum + (msg.content?.length || 0);
    }, 0);
    
    return Math.ceil(totalChars / 4);
  }
}