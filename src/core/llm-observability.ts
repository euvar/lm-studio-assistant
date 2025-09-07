import { v4 as uuidv4 } from 'uuid';

interface TraceEvent {
  id: string;
  timestamp: number;
  type: 'intent' | 'action' | 'tool' | 'response' | 'error';
  sessionId: string;
  userId?: string;
  data: any;
  metadata: Record<string, any>;
}

interface PerformanceMetrics {
  intentRecognitionTime: number;
  actionMappingTime: number;
  executionTime: number;
  totalTime: number;
  modelVersion?: string;
  confidence?: number;
}

export class LLMObservability {
  private traces: Map<string, TraceEvent[]> = new Map();
  private metrics: PerformanceMetrics[] = [];
  private currentSession: string;

  constructor() {
    this.currentSession = uuidv4();
  }

  startSession(userId?: string): string {
    this.currentSession = uuidv4();
    this.traces.set(this.currentSession, []);
    
    this.logEvent({
      type: 'intent',
      data: { action: 'session_start' },
      metadata: { userId }
    });

    return this.currentSession;
  }

  logIntentRecognition(
    input: string, 
    intent: any, 
    timeMs: number
  ): void {
    this.logEvent({
      type: 'intent',
      data: {
        input,
        intent: intent.type,
        confidence: intent.confidence,
        entities: intent.entities
      },
      metadata: {
        processingTime: timeMs,
        reasoning: intent.reasoning
      }
    });
  }

  logActionMapping(
    intent: any,
    actions: any[],
    timeMs: number
  ): void {
    this.logEvent({
      type: 'action',
      data: {
        intent: intent.type,
        actions: actions.map(a => ({
          tool: a.tool,
          description: a.description
        }))
      },
      metadata: {
        processingTime: timeMs,
        actionCount: actions.length
      }
    });
  }

  logToolExecution(
    tool: string,
    parameters: any,
    result: any,
    timeMs: number
  ): void {
    this.logEvent({
      type: 'tool',
      data: {
        tool,
        parameters,
        success: result.success !== false,
        output: result.data || result.message
      },
      metadata: {
        executionTime: timeMs,
        error: result.error
      }
    });
  }

  logError(
    error: any,
    context: string
  ): void {
    this.logEvent({
      type: 'error',
      data: {
        error: error.message || error,
        stack: error.stack,
        context
      },
      metadata: {
        severity: 'error',
        timestamp: Date.now()
      }
    });
  }

  private logEvent(event: Omit<TraceEvent, 'id' | 'timestamp' | 'sessionId'>): void {
    const fullEvent: TraceEvent = {
      id: uuidv4(),
      timestamp: Date.now(),
      sessionId: this.currentSession,
      ...event
    };

    const sessionTraces = this.traces.get(this.currentSession) || [];
    sessionTraces.push(fullEvent);
    this.traces.set(this.currentSession, sessionTraces);

    // Log to console in development
    if (process.env.DEBUG === 'true') {
      console.log('[LLM Observability]', JSON.stringify(fullEvent, null, 2));
    }
  }

  recordMetrics(metrics: Partial<PerformanceMetrics>): void {
    this.metrics.push({
      intentRecognitionTime: 0,
      actionMappingTime: 0,
      executionTime: 0,
      totalTime: 0,
      ...metrics
    });
  }

  getSessionTrace(sessionId?: string): TraceEvent[] {
    const id = sessionId || this.currentSession;
    return this.traces.get(id) || [];
  }

  getAverageMetrics(): PerformanceMetrics {
    if (this.metrics.length === 0) {
      return {
        intentRecognitionTime: 0,
        actionMappingTime: 0,
        executionTime: 0,
        totalTime: 0
      };
    }

    const sum = this.metrics.reduce((acc, m) => ({
      intentRecognitionTime: acc.intentRecognitionTime + m.intentRecognitionTime,
      actionMappingTime: acc.actionMappingTime + m.actionMappingTime,
      executionTime: acc.executionTime + m.executionTime,
      totalTime: acc.totalTime + m.totalTime
    }));

    const count = this.metrics.length;
    
    return {
      intentRecognitionTime: sum.intentRecognitionTime / count,
      actionMappingTime: sum.actionMappingTime / count,
      executionTime: sum.executionTime / count,
      totalTime: sum.totalTime / count
    };
  }

  exportTraces(): string {
    const allTraces = Array.from(this.traces.entries()).map(([sessionId, events]) => ({
      sessionId,
      events,
      metrics: this.getSessionMetrics(sessionId)
    }));

    return JSON.stringify(allTraces, null, 2);
  }

  private getSessionMetrics(sessionId: string): any {
    const events = this.traces.get(sessionId) || [];
    
    const intentEvents = events.filter(e => e.type === 'intent');
    const toolEvents = events.filter(e => e.type === 'tool');
    const errorEvents = events.filter(e => e.type === 'error');

    return {
      totalEvents: events.length,
      intentsProcessed: intentEvents.length,
      toolsExecuted: toolEvents.length,
      errors: errorEvents.length,
      sessionDuration: events.length > 0 ? 
        events[events.length - 1].timestamp - events[0].timestamp : 0
    };
  }
}

// Global instance for easy access
export const observability = new LLMObservability();