import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ChatMessage } from '../providers/lmstudio.js';

interface HistoryEntry {
  message: string;
  timestamp: number;
  role?: 'user' | 'assistant';
}

export class HistoryManager {
  private historyDir: string;
  private currentSessionFile: string;
  private sessionHistory: HistoryEntry[] = [];
  
  constructor() {
    // Store history in user's home directory
    this.historyDir = path.join(os.homedir(), '.lm-assistant', 'history');
    this.currentSessionFile = '';
  }

  async initialize(): Promise<void> {
    try {
      // Create history directory if it doesn't exist
      await fs.mkdir(this.historyDir, { recursive: true });
      
      // Create a new session file with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      this.currentSessionFile = path.join(this.historyDir, `session-${timestamp}.json`);
      
      // Initialize with empty array
      await this.save([]);
    } catch (error) {
      console.error('Failed to initialize history:', error);
    }
  }

  async save(messages: ChatMessage[]): Promise<void> {
    // Update session history
    this.sessionHistory = messages.map(msg => ({
      message: msg.content,
      timestamp: Date.now(),
      role: msg.role as 'user' | 'assistant'
    }));
    try {
      if (!this.currentSessionFile) return;
      
      const data = {
        timestamp: new Date().toISOString(),
        messages: messages,
      };
      
      await fs.writeFile(this.currentSessionFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  async loadLatest(): Promise<ChatMessage[]> {
    try {
      // Get all session files
      const files = await fs.readdir(this.historyDir);
      const sessionFiles = files
        .filter(f => f.startsWith('session-'))
        .sort()
        .reverse(); // Most recent first
      
      if (sessionFiles.length === 0) {
        return [];
      }
      
      // Load the most recent session
      const latestFile = path.join(this.historyDir, sessionFiles[0]);
      const content = await fs.readFile(latestFile, 'utf-8');
      const data = JSON.parse(content);
      
      return data.messages || [];
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    }
  }

  async listSessions(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.historyDir);
      return files
        .filter(f => f.startsWith('session-'))
        .sort()
        .reverse()
        .slice(0, 10); // Last 10 sessions
    } catch (error) {
      return [];
    }
  }

  async loadSession(filename: string): Promise<ChatMessage[]> {
    try {
      const filePath = path.join(this.historyDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return data.messages || [];
    } catch (error) {
      console.error('Failed to load session:', error);
      return [];
    }
  }

  async clearHistory(): Promise<void> {
    try {
      const files = await fs.readdir(this.historyDir);
      for (const file of files) {
        if (file.startsWith('session-')) {
          await fs.unlink(path.join(this.historyDir, file));
        }
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }

  async getRecentHistory(limit: number = 10): Promise<HistoryEntry[]> {
    // Get the most recent entries from the current session
    return this.sessionHistory.slice(-limit).reverse();
  }

  async getFullHistory(): Promise<HistoryEntry[]> {
    // In a full implementation, this would read from all session files
    // For now, return current session history
    return this.sessionHistory;
  }
}