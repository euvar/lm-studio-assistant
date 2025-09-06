import chalk from 'chalk';

export interface AgentMetrics {
  agentName: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  lastUsed: Date;
  toolsUsed: Map<string, number>;
}

export class AgentMetricsTracker {
  private metrics: Map<string, AgentMetrics> = new Map();
  private callTimes: Map<string, number[]> = new Map();

  recordCall(agentName: string, success: boolean, responseTime: number, toolsUsed?: string[]): void {
    // Get or create metrics
    let agentMetrics = this.metrics.get(agentName);
    if (!agentMetrics) {
      agentMetrics = {
        agentName,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageResponseTime: 0,
        lastUsed: new Date(),
        toolsUsed: new Map()
      };
      this.metrics.set(agentName, agentMetrics);
      this.callTimes.set(agentName, []);
    }

    // Update metrics
    agentMetrics.totalCalls++;
    if (success) {
      agentMetrics.successfulCalls++;
    } else {
      agentMetrics.failedCalls++;
    }
    agentMetrics.lastUsed = new Date();

    // Update response times
    const times = this.callTimes.get(agentName) || [];
    times.push(responseTime);
    if (times.length > 100) times.shift(); // Keep last 100 times
    agentMetrics.averageResponseTime = Math.round(
      times.reduce((a, b) => a + b, 0) / times.length
    );

    // Track tools used
    if (toolsUsed) {
      toolsUsed.forEach(tool => {
        const count = agentMetrics.toolsUsed.get(tool) || 0;
        agentMetrics.toolsUsed.set(tool, count + 1);
      });
    }
  }

  getMetrics(agentName: string): AgentMetrics | null {
    return this.metrics.get(agentName) || null;
  }

  getAllMetrics(): AgentMetrics[] {
    return Array.from(this.metrics.values());
  }

  getTopAgents(limit: number = 5): AgentMetrics[] {
    return this.getAllMetrics()
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, limit);
  }

  getSuccessRate(agentName: string): number {
    const metrics = this.getMetrics(agentName);
    if (!metrics || metrics.totalCalls === 0) return 0;
    return metrics.successfulCalls / metrics.totalCalls;
  }

  formatReport(): string {
    const lines: string[] = [
      chalk.bold('\n📊 Agent Metrics Report'),
      chalk.dim('─'.repeat(50))
    ];

    const sortedMetrics = this.getAllMetrics().sort((a, b) => b.totalCalls - a.totalCalls);

    sortedMetrics.forEach(metrics => {
      const successRate = (metrics.successfulCalls / Math.max(metrics.totalCalls, 1) * 100).toFixed(1);
      
      lines.push(
        chalk.cyan(`\n${metrics.agentName}:`),
        `  Total calls: ${metrics.totalCalls}`,
        `  Success rate: ${successRate}%`,
        `  Avg response time: ${metrics.averageResponseTime}ms`,
        `  Last used: ${metrics.lastUsed.toLocaleTimeString()}`
      );

      if (metrics.toolsUsed.size > 0) {
        lines.push('  Tools used:');
        const sortedTools = Array.from(metrics.toolsUsed.entries())
          .sort((a, b) => b[1] - a[1]);
        
        sortedTools.forEach(([tool, count]) => {
          lines.push(`    - ${tool}: ${count} times`);
        });
      }
    });

    return lines.join('\n');
  }

  reset(): void {
    this.metrics.clear();
    this.callTimes.clear();
  }
}

// Global instance
export const agentMetrics = new AgentMetricsTracker();