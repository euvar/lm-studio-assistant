import crypto from 'crypto';

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 100;
  private defaultTTL: number = 300000; // 5 minutes

  constructor(maxSize?: number, defaultTTL?: number) {
    if (maxSize) this.maxSize = maxSize;
    if (defaultTTL) this.defaultTTL = defaultTTL;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update hit count
    entry.hits++;
    return entry.value;
  }

  has(key: string): boolean {
    const value = this.get(key);
    return value !== null;
  }

  generateKey(...args: any[]): string {
    const data = JSON.stringify(args);
    return crypto.createHash('md5').update(data).digest('hex');
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    avgHits: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, entry) => sum + entry.hits, 0);
    const entriesWithHits = entries.filter(e => e.hits > 0).length;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: entriesWithHits / Math.max(entries.length, 1),
      avgHits: totalHits / Math.max(entries.length, 1)
    };
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find least recently used item
    for (const [key, entry] of this.cache) {
      const lastAccess = entry.timestamp + (entry.hits * 60000); // Factor in hits
      if (lastAccess < oldestTime) {
        oldestTime = lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// Specific caches for different purposes
export class ToolResultCache extends CacheManager {
  constructor() {
    super(50, 600000); // 10 minute TTL for tool results
  }

  cacheToolResult(tool: string, params: any, result: any): void {
    const key = this.generateKey(tool, params);
    this.set(key, result);
  }

  getToolResult(tool: string, params: any): any | null {
    const key = this.generateKey(tool, params);
    return this.get(key);
  }
}

export class AgentDecisionCache extends CacheManager {
  constructor() {
    super(30, 180000); // 3 minute TTL for agent decisions
  }

  cacheDecision(input: string, context: any, decision: any): void {
    const key = this.generateKey(input, context);
    this.set(key, decision);
  }

  getDecision(input: string, context: any): any | null {
    const key = this.generateKey(input, context);
    return this.get(key);
  }
}

// Global instances
export const toolResultCache = new ToolResultCache();
export const agentDecisionCache = new AgentDecisionCache();