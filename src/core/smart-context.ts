import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { encode } from 'gpt-3-encoder';

interface ContextPriority {
  currentTask: string[];
  recentErrors: string[];
  projectStructure: string[];
  userPreferences: string[];
}

interface MemoryEntry {
  id: string;
  content: string;
  timestamp: Date;
  category: 'task' | 'error' | 'solution' | 'preference';
  relevanceScore: number;
  tokenCount: number;
}

export class SmartContextManager extends EventEmitter {
  private contextPriority: ContextPriority = {
    currentTask: [],
    recentErrors: [],
    projectStructure: [],
    userPreferences: []
  };

  private memoryStore: Map<string, MemoryEntry> = new Map();
  private maxTokens: number = 8000;
  private memoryPath: string;

  constructor(configPath: string) {
    super();
    this.memoryPath = path.join(configPath, 'memory');
    this.initializeMemory();
  }

  private async initializeMemory() {
    try {
      await fs.mkdir(this.memoryPath, { recursive: true });
      await this.loadPersistedMemory();
    } catch (error) {
      console.error('Failed to initialize memory:', error);
    }
  }

  private async loadPersistedMemory() {
    try {
      const files = await fs.readdir(this.memoryPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.memoryPath, file), 'utf-8');
            if (content.trim()) { // Only parse if content is not empty
              const entry = JSON.parse(content) as MemoryEntry;
              entry.timestamp = new Date(entry.timestamp);
              this.memoryStore.set(entry.id, entry);
            }
          } catch (parseError) {
            console.warn(`Failed to parse memory file ${file}:`, parseError);
            // Delete corrupted file
            await fs.unlink(path.join(this.memoryPath, file)).catch(() => {});
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted memory:', error);
    }
  }

  async addMemory(content: string, category: MemoryEntry['category']) {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tokenCount = encode(content).length;
    
    const entry: MemoryEntry = {
      id,
      content,
      timestamp: new Date(),
      category,
      relevanceScore: 1.0,
      tokenCount
    };

    this.memoryStore.set(id, entry);
    await this.persistMemory(entry);
    
    this.emit('memoryAdded', entry);
  }

  private async persistMemory(entry: MemoryEntry) {
    try {
      const filePath = path.join(this.memoryPath, `${entry.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.error('Failed to persist memory:', error);
    }
  }

  updateCurrentTask(task: string[]) {
    this.contextPriority.currentTask = task;
    this.addMemory(task.join('\n'), 'task');
  }

  addError(error: string) {
    this.contextPriority.recentErrors.push(error);
    if (this.contextPriority.recentErrors.length > 5) {
      this.contextPriority.recentErrors.shift();
    }
    this.addMemory(error, 'error');
  }

  addSolution(problem: string, solution: string) {
    const solutionEntry = `Problem: ${problem}\nSolution: ${solution}`;
    this.addMemory(solutionEntry, 'solution');
  }

  updateProjectStructure(structure: string[]) {
    this.contextPriority.projectStructure = structure;
  }

  addUserPreference(preference: string) {
    this.contextPriority.userPreferences.push(preference);
    this.addMemory(preference, 'preference');
  }

  compress(): string {
    const contextParts: string[] = [];
    let totalTokens = 0;
    
    // Priority 1: Current task
    if (this.contextPriority.currentTask.length > 0) {
      const taskContext = `Current Task:\n${this.contextPriority.currentTask.join('\n')}`;
      const tokens = encode(taskContext).length;
      if (totalTokens + tokens < this.maxTokens * 0.3) {
        contextParts.push(taskContext);
        totalTokens += tokens;
      }
    }
    
    // Priority 2: Recent errors
    if (this.contextPriority.recentErrors.length > 0) {
      const errorContext = `Recent Errors:\n${this.contextPriority.recentErrors.join('\n')}`;
      const tokens = encode(errorContext).length;
      if (totalTokens + tokens < this.maxTokens * 0.5) {
        contextParts.push(errorContext);
        totalTokens += tokens;
      }
    }
    
    // Priority 3: Relevant memories
    const relevantMemories = this.findRelevantMemories();
    for (const memory of relevantMemories) {
      if (totalTokens + memory.tokenCount < this.maxTokens * 0.8) {
        contextParts.push(`[${memory.category}] ${memory.content}`);
        totalTokens += memory.tokenCount;
      }
    }
    
    // Priority 4: Project structure (compact)
    if (this.contextPriority.projectStructure.length > 0) {
      const structureContext = `Project Structure:\n${this.contextPriority.projectStructure.slice(0, 10).join('\n')}`;
      const tokens = encode(structureContext).length;
      if (totalTokens + tokens < this.maxTokens * 0.95) {
        contextParts.push(structureContext);
        totalTokens += tokens;
      }
    }
    
    return contextParts.join('\n\n---\n\n');
  }

  private findRelevantMemories(): MemoryEntry[] {
    const memories = Array.from(this.memoryStore.values());
    
    // Sort by relevance and recency
    memories.sort((a, b) => {
      const scoreA = a.relevanceScore * (1 / (Date.now() - a.timestamp.getTime() + 1));
      const scoreB = b.relevanceScore * (1 / (Date.now() - b.timestamp.getTime() + 1));
      return scoreB - scoreA;
    });
    
    return memories.slice(0, 10);
  }

  async searchMemory(query: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const queryLower = query.toLowerCase();
    
    for (const memory of this.memoryStore.values()) {
      if (memory.content.toLowerCase().includes(queryLower)) {
        results.push(memory);
      }
    }
    
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  updateRelevanceScores(usedMemories: string[]) {
    for (const memoryId of usedMemories) {
      const memory = this.memoryStore.get(memoryId);
      if (memory) {
        memory.relevanceScore = Math.min(memory.relevanceScore * 1.1, 2.0);
        this.persistMemory(memory);
      }
    }
    
    // Decay unused memories
    for (const memory of this.memoryStore.values()) {
      if (!usedMemories.includes(memory.id)) {
        memory.relevanceScore = Math.max(memory.relevanceScore * 0.95, 0.1);
      }
    }
  }

  async clearOldMemories(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const memoriesToDelete: string[] = [];
    for (const [id, memory] of this.memoryStore) {
      if (memory.timestamp < cutoffDate && memory.relevanceScore < 0.3) {
        memoriesToDelete.push(id);
      }
    }
    
    for (const id of memoriesToDelete) {
      this.memoryStore.delete(id);
      try {
        await fs.unlink(path.join(this.memoryPath, `${id}.json`));
      } catch (error) {
        console.error(`Failed to delete memory file ${id}:`, error);
      }
    }
    
    return memoriesToDelete.length;
  }

  getStats() {
    const stats = {
      totalMemories: this.memoryStore.size,
      byCategory: {} as Record<MemoryEntry['category'], number>,
      totalTokens: 0,
      averageRelevance: 0
    };
    
    for (const memory of this.memoryStore.values()) {
      stats.byCategory[memory.category] = (stats.byCategory[memory.category] || 0) + 1;
      stats.totalTokens += memory.tokenCount;
      stats.averageRelevance += memory.relevanceScore;
    }
    
    if (stats.totalMemories > 0) {
      stats.averageRelevance /= stats.totalMemories;
    }
    
    return stats;
  }
}