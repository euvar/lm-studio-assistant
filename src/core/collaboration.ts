import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

interface User {
  id: string;
  name: string;
  avatar?: string;
  role: 'owner' | 'collaborator' | 'viewer';
  color: string;
  cursor?: CursorPosition;
  status: 'online' | 'idle' | 'offline';
}

interface CursorPosition {
  file?: string;
  line?: number;
  column?: number;
}

interface CollaborativeSession {
  id: string;
  name: string;
  owner: string;
  users: Map<string, User>;
  sharedContext: any;
  chatHistory: ChatMessage[];
  codeEdits: CodeEdit[];
  createdAt: Date;
  lastActivity: Date;
}

interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  type: 'message' | 'code' | 'command' | 'result';
}

interface CodeEdit {
  id: string;
  userId: string;
  file: string;
  operation: 'insert' | 'delete' | 'replace';
  range: { start: Position; end: Position };
  content?: string;
  timestamp: Date;
}

interface Position {
  line: number;
  column: number;
}

interface CollaborationEvent {
  type: 'user-joined' | 'user-left' | 'cursor-moved' | 'code-edited' | 
        'chat-message' | 'command-executed' | 'context-updated';
  sessionId: string;
  userId: string;
  data: any;
  timestamp: Date;
}

export class CollaborationManager extends EventEmitter {
  private sessions: Map<string, CollaborativeSession> = new Map();
  private userSessions: Map<string, string> = new Map(); // userId -> sessionId
  private wsServer?: WebSocketServer;
  private wsClients: Map<string, WebSocket> = new Map();

  constructor() {
    super();
  }

  // Initialize WebSocket server for real-time collaboration
  initializeServer(port: number = 3001) {
    this.wsServer = new WebSocketServer({ port });
    
    this.wsServer.on('connection', (ws: WebSocket, req: any) => {
      const userId = this.extractUserId(req);
      if (!userId) {
        ws.close(1008, 'User ID required');
        return;
      }
      
      this.wsClients.set(userId, ws);
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(userId, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });
      
      ws.on('close', () => {
        this.wsClients.delete(userId);
        this.handleUserDisconnect(userId);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
      });
    });
    
    console.log(`Collaboration server started on port ${port}`);
  }

  private extractUserId(req: any): string | null {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get('userId');
  }

  // Create a new collaborative session
  createSession(name: string, ownerId: string): CollaborativeSession {
    const sessionId = uuidv4();
    const owner: User = {
      id: ownerId,
      name: 'Session Owner',
      role: 'owner',
      color: this.generateUserColor(),
      status: 'online'
    };

    const session: CollaborativeSession = {
      id: sessionId,
      name,
      owner: ownerId,
      users: new Map([[ownerId, owner]]),
      sharedContext: {},
      chatHistory: [],
      codeEdits: [],
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    this.userSessions.set(ownerId, sessionId);
    
    return session;
  }

  // Join an existing session
  joinSession(sessionId: string, userId: string, userName: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const user: User = {
      id: userId,
      name: userName,
      role: 'collaborator',
      color: this.generateUserColor(),
      status: 'online'
    };

    session.users.set(userId, user);
    this.userSessions.set(userId, sessionId);
    session.lastActivity = new Date();

    // Notify other users
    this.broadcastToSession(sessionId, {
      type: 'user-joined',
      sessionId,
      userId,
      data: { user },
      timestamp: new Date()
    }, userId);

    this.emit('userJoined', { sessionId, user });
    
    return true;
  }

  // Leave a session
  leaveSession(userId: string): boolean {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return false;

    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.users.delete(userId);
    this.userSessions.delete(userId);

    // Notify other users
    this.broadcastToSession(sessionId, {
      type: 'user-left',
      sessionId,
      userId,
      data: {},
      timestamp: new Date()
    });

    // Clean up empty sessions
    if (session.users.size === 0) {
      this.sessions.delete(sessionId);
    }

    this.emit('userLeft', { sessionId, userId });
    
    return true;
  }

  // Update user cursor position
  updateCursorPosition(userId: string, cursor: CursorPosition) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const user = session.users.get(userId);
    if (user) {
      user.cursor = cursor;
      session.lastActivity = new Date();

      // Broadcast cursor update
      this.broadcastToSession(sessionId, {
        type: 'cursor-moved',
        sessionId,
        userId,
        data: { cursor },
        timestamp: new Date()
      }, userId);
    }
  }

  // Send chat message
  sendChatMessage(userId: string, content: string, type: ChatMessage['type'] = 'message') {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message: ChatMessage = {
      id: uuidv4(),
      userId,
      content,
      timestamp: new Date(),
      type
    };

    session.chatHistory.push(message);
    session.lastActivity = new Date();

    // Broadcast message
    this.broadcastToSession(sessionId, {
      type: 'chat-message',
      sessionId,
      userId,
      data: { message },
      timestamp: new Date()
    });

    this.emit('chatMessage', { sessionId, message });
  }

  // Collaborative code editing with OT (Operational Transformation)
  applyCodeEdit(userId: string, edit: Omit<CodeEdit, 'id' | 'userId' | 'timestamp'>) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const codeEdit: CodeEdit = {
      id: uuidv4(),
      userId,
      ...edit,
      timestamp: new Date()
    };

    // Apply operational transformation to resolve conflicts
    const transformedEdit = this.transformEdit(codeEdit, session.codeEdits);
    
    session.codeEdits.push(transformedEdit);
    session.lastActivity = new Date();

    // Broadcast edit
    this.broadcastToSession(sessionId, {
      type: 'code-edited',
      sessionId,
      userId,
      data: { edit: transformedEdit },
      timestamp: new Date()
    }, userId);

    this.emit('codeEdited', { sessionId, edit: transformedEdit });
  }

  // Simple OT implementation for conflict resolution
  private transformEdit(newEdit: CodeEdit, existingEdits: CodeEdit[]): CodeEdit {
    let transformed = { ...newEdit };
    
    // Get concurrent edits (edits that happened after this edit was created)
    const concurrentEdits = existingEdits.filter(e => 
      e.timestamp > new Date(Date.now() - 1000) && // Within last second
      e.file === newEdit.file &&
      e.userId !== newEdit.userId
    );

    for (const concurrent of concurrentEdits) {
      if (concurrent.operation === 'insert') {
        // Adjust positions if concurrent insert happened before our position
        if (concurrent.range.start.line < transformed.range.start.line ||
            (concurrent.range.start.line === transformed.range.start.line &&
             concurrent.range.start.column <= transformed.range.start.column)) {
          
          const lineShift = concurrent.content?.split('\n').length || 1;
          transformed.range.start.line += lineShift - 1;
          transformed.range.end.line += lineShift - 1;
        }
      }
    }
    
    return transformed;
  }

  // Share AI context across session
  updateSharedContext(userId: string, context: any) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedContext = {
      ...session.sharedContext,
      ...context,
      lastUpdatedBy: userId,
      lastUpdated: new Date()
    };

    session.lastActivity = new Date();

    // Broadcast context update
    this.broadcastToSession(sessionId, {
      type: 'context-updated',
      sessionId,
      userId,
      data: { context: session.sharedContext },
      timestamp: new Date()
    });

    this.emit('contextUpdated', { sessionId, context: session.sharedContext });
  }

  // Execute command collaboratively
  executeCollaborativeCommand(userId: string, command: string, result: any) {
    this.sendChatMessage(userId, command, 'command');
    this.sendChatMessage(userId, JSON.stringify(result, null, 2), 'result');
    
    // Broadcast command execution
    const sessionId = this.userSessions.get(userId);
    if (sessionId) {
      this.broadcastToSession(sessionId, {
        type: 'command-executed',
        sessionId,
        userId,
        data: { command, result },
        timestamp: new Date()
      });
    }
  }

  // Code review mode
  startCodeReview(sessionId: string, files: string[]) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const reviewContext = {
      mode: 'code-review',
      files,
      comments: new Map<string, any[]>(),
      approvals: new Map<string, boolean>()
    };

    session.sharedContext.review = reviewContext;
    
    this.broadcastToSession(sessionId, {
      type: 'context-updated',
      sessionId,
      userId: 'system',
      data: { 
        context: { review: reviewContext },
        notification: 'Code review started'
      },
      timestamp: new Date()
    });
  }

  // Add review comment
  addReviewComment(userId: string, file: string, line: number, comment: string) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session?.sharedContext.review) return;

    const reviewComment = {
      id: uuidv4(),
      userId,
      file,
      line,
      comment,
      timestamp: new Date()
    };

    if (!session.sharedContext.review.comments.has(file)) {
      session.sharedContext.review.comments.set(file, []);
    }
    
    session.sharedContext.review.comments.get(file).push(reviewComment);
    
    this.broadcastToSession(sessionId, {
      type: 'context-updated',
      sessionId,
      userId,
      data: { 
        reviewComment,
        notification: `Review comment added on ${file}:${line}`
      },
      timestamp: new Date()
    });
  }

  // Pair programming mode
  enablePairProgramming(sessionId: string, driverId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedContext.pairProgramming = {
      enabled: true,
      driver: driverId,
      navigator: Array.from(session.users.keys()).find(id => id !== driverId)
    };

    this.broadcastToSession(sessionId, {
      type: 'context-updated',
      sessionId,
      userId: 'system',
      data: { 
        pairProgramming: session.sharedContext.pairProgramming,
        notification: 'Pair programming mode enabled'
      },
      timestamp: new Date()
    });
  }

  // Switch driver/navigator roles
  switchRoles(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session?.sharedContext.pairProgramming) return;

    const { driver, navigator } = session.sharedContext.pairProgramming;
    session.sharedContext.pairProgramming.driver = navigator;
    session.sharedContext.pairProgramming.navigator = driver;

    this.broadcastToSession(sessionId, {
      type: 'context-updated',
      sessionId,
      userId: 'system',
      data: { 
        pairProgramming: session.sharedContext.pairProgramming,
        notification: 'Roles switched'
      },
      timestamp: new Date()
    });
  }

  // Broadcast to all users in a session
  private broadcastToSession(sessionId: string, event: CollaborationEvent, excludeUserId?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [userId, user] of session.users) {
      if (userId === excludeUserId) continue;
      
      const ws = this.wsClients.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }
  }

  // Handle WebSocket messages
  private handleWebSocketMessage(userId: string, message: any) {
    switch (message.type) {
      case 'cursor':
        this.updateCursorPosition(userId, message.data);
        break;
      case 'chat':
        this.sendChatMessage(userId, message.data.content, message.data.type);
        break;
      case 'code-edit':
        this.applyCodeEdit(userId, message.data);
        break;
      case 'context-update':
        this.updateSharedContext(userId, message.data);
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  // Handle user disconnect
  private handleUserDisconnect(userId: string) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const user = session.users.get(userId);
    if (user) {
      user.status = 'offline';
      
      this.broadcastToSession(sessionId, {
        type: 'user-left',
        sessionId,
        userId,
        data: { temporary: true },
        timestamp: new Date()
      });
    }
  }

  // Generate a unique color for each user
  private generateUserColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8C471', '#82E0AA'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Get session info
  getSession(sessionId: string): CollaborativeSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Get user's current session
  getUserSession(userId: string): string | undefined {
    return this.userSessions.get(userId);
  }

  // List all active sessions
  listSessions(): Array<{ id: string; name: string; users: number; created: Date }> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      name: session.name,
      users: session.users.size,
      created: session.createdAt
    }));
  }

  // Generate shareable session link
  generateSessionLink(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    // In production, this would generate a proper URL
    const token = crypto.randomBytes(16).toString('hex');
    return `lm-assistant://join-session/${sessionId}?token=${token}`;
  }
}