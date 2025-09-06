import { EventEmitter } from 'events';
import { ChromaClient, Collection } from 'chromadb';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { SimpleVectorDatabase } from './simple-vector-db.js';

interface Document {
  id: string;
  text: string;
  metadata: {
    type: 'code' | 'documentation' | 'conversation' | 'error' | 'solution' | 'intent_example';
    filePath?: string;
    timestamp: number;
    language?: string;
    tags?: string[];
    score?: number;
    intentType?: string;
  };
}

interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: any;
}

interface VectorDBConfig {
  persistDirectory?: string;
  collectionName?: string;
  embeddingModel?: string;
  useLocalEmbeddings?: boolean;
  localEmbeddingEndpoint?: string;
}

export class VectorDatabase extends EventEmitter {
  private client: ChromaClient | null = null;
  private collection?: Collection;
  private config: VectorDBConfig;
  private embeddingFunction: any;
  private isInitialized: boolean = false;
  private simpleDB?: SimpleVectorDatabase;
  private useSimpleDB: boolean = false;

  constructor(config: VectorDBConfig = {}) {
    super();
    this.config = {
      persistDirectory: './data/vectordb',
      collectionName: 'lm_assistant_knowledge',
      embeddingModel: 'text-embedding-ada-002',
      useLocalEmbeddings: true,
      localEmbeddingEndpoint: 'http://localhost:1234/v1',
      ...config
    };

  }

  async initialize() {
    try {
      // Try to initialize ChromaDB client
      try {
        this.client = new ChromaClient();
        // Test connection
        await this.client.heartbeat();
      } catch (error) {
        console.warn('ChromaDB not available, falling back to simple in-memory vector DB');
        this.useSimpleDB = true;
        this.simpleDB = new SimpleVectorDatabase();
        await this.simpleDB.initialize();
        this.isInitialized = true;
        this.emit('initialized');
        return;
      }
      // Create embedding function
      if (this.config.useLocalEmbeddings) {
        // Use local embeddings from LM Studio
        this.embeddingFunction = {
          generate: async (texts: string[]) => {
            return await this.generateLocalEmbeddings(texts);
          }
        };
      } else {
        // Use OpenAI embeddings via custom function
        this.embeddingFunction = {
          generate: async (texts: string[]) => {
            const axios = (await import('axios')).default;
            const embeddings: number[][] = [];
            
            for (const text of texts) {
              try {
                const response = await axios.post(
                  'https://api.openai.com/v1/embeddings',
                  {
                    input: text,
                    model: this.config.embeddingModel
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                embeddings.push(response.data.data[0].embedding);
              } catch (error) {
                // Fallback to simple embeddings
                embeddings.push(this.generateSimpleEmbedding(text));
              }
            }
            
            return embeddings;
          }
        };
      }

      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.config.collectionName!,
          embeddingFunction: this.embeddingFunction
        });
      } catch {
        this.collection = await this.client.createCollection({
          name: this.config.collectionName!,
          embeddingFunction: this.embeddingFunction
        });
      }

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize vector database:', error);
      throw error;
    }
  }

  // Generate embeddings using local LM Studio
  private async generateLocalEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const axios = (await import('axios')).default;
      const embeddings: number[][] = [];

      for (const text of texts) {
        const response = await axios.post(
          `${this.config.localEmbeddingEndpoint}/embeddings`,
          {
            input: text,
            model: 'nomic-embed-text'
          },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        embeddings.push(response.data.data[0].embedding);
      }

      return embeddings;
    } catch (error) {
      console.error('Failed to generate local embeddings:', error);
      // Fallback to simple hash-based embeddings
      return texts.map(text => this.generateSimpleEmbedding(text));
    }
  }

  // Simple fallback embedding using hash
  private generateSimpleEmbedding(text: string): number[] {
    const embedding = new Array(384).fill(0);
    const hash = crypto.createHash('sha256').update(text).digest();
    
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = (hash[i % hash.length] / 255) * 2 - 1;
    }

    return embedding;
  }

  // Add document to the vector database
  async addDocument(doc: Document) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.addDocument(doc);
    }

    try {
      await this.collection!.add({
        ids: [doc.id],
        documents: [doc.text],
        metadatas: [doc.metadata as any]
      });

      this.emit('documentAdded', doc);
    } catch (error) {
      console.error('Failed to add document:', error);
      throw error;
    }
  }

  // Add multiple documents
  async addDocuments(docs: Document[]) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.addDocuments(docs);
    }

    try {
      await this.collection!.add({
        ids: docs.map(d => d.id),
        documents: docs.map(d => d.text),
        metadatas: docs.map(d => d.metadata as any)
      });

      this.emit('documentsAdded', { count: docs.length });
    } catch (error) {
      console.error('Failed to add documents:', error);
      throw error;
    }
  }

  // Semantic search
  async search(query: string, options?: {
    limit?: number;
    filter?: any;
    includeDistance?: boolean;
  }): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.search(query, options);
    }

    try {
      const results = await this.collection!.query({
        queryTexts: [query],
        nResults: options?.limit || 5,
        whereDocument: options?.filter
      });

      const searchResults: SearchResult[] = [];
      
      if (results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          searchResults.push({
            id: results.ids[0][i],
            text: results.documents[0][i] || '',
            score: results.distances ? 1 - (results.distances[0][i] || 0) : 1,
            metadata: results.metadatas[0][i] || {}
          });
        }
      }

      this.emit('searchCompleted', { query, results: searchResults.length });
      return searchResults;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  // Search by type
  async searchByType(query: string, type: Document['metadata']['type'], limit: number = 5): Promise<SearchResult[]> {
    return await this.search(query, {
      limit,
      filter: { type }
    });
  }

  // Find similar documents
  async findSimilar(documentId: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.findSimilar(documentId, limit);
    }

    try {
      const doc = await this.collection!.get({
        ids: [documentId]
      });

      if (!doc.documents[0]) {
        return [];
      }

      return await this.search(doc.documents[0], { limit });
    } catch (error) {
      console.error('Failed to find similar documents:', error);
      return [];
    }
  }

  // Index code files
  async indexCodeFiles(directory: string, extensions: string[] = ['.ts', '.js', '.py', '.java', '.cpp']) {
    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.indexCodeFiles(directory, extensions);
    }
    const files = await this.findFiles(directory, extensions);
    const documents: Document[] = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const ext = path.extname(file);
        
        // Split large files into chunks
        const chunks = this.splitIntoChunks(content, 1000);
        
        for (let i = 0; i < chunks.length; i++) {
          documents.push({
            id: crypto.createHash('md5').update(`${file}_${i}`).digest('hex'),
            text: chunks[i],
            metadata: {
              type: 'code',
              filePath: file,
              timestamp: Date.now(),
              language: ext.substring(1),
              tags: [ext.substring(1), 'code', path.basename(file)]
            }
          });
        }
      } catch (error) {
        console.error(`Failed to index file ${file}:`, error);
      }
    }

    await this.addDocuments(documents);
    this.emit('codeFilesIndexed', { count: documents.length, files: files.length });
  }

  // Index conversation history
  async indexConversation(messages: Array<{ role: string; content: string; timestamp?: number }>) {
    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.indexConversation(messages);
    }
    const documents: Document[] = messages.map((msg, index) => ({
      id: crypto.createHash('md5').update(`conv_${Date.now()}_${index}`).digest('hex'),
      text: `${msg.role}: ${msg.content}`,
      metadata: {
        type: 'conversation',
        timestamp: msg.timestamp || Date.now(),
        tags: [msg.role, 'conversation']
      }
    }));

    await this.addDocuments(documents);
    this.emit('conversationIndexed', { messageCount: messages.length });
  }

  // Index error and solution pairs
  async indexErrorSolution(error: string, solution: string, context?: any) {
    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.indexErrorSolution(error, solution, context);
    }
    const errorDoc: Document = {
      id: crypto.createHash('md5').update(`error_${Date.now()}`).digest('hex'),
      text: error,
      metadata: {
        type: 'error',
        timestamp: Date.now(),
        tags: ['error'],
        ...context
      }
    };

    const solutionDoc: Document = {
      id: crypto.createHash('md5').update(`solution_${Date.now()}`).digest('hex'),
      text: solution,
      metadata: {
        type: 'solution',
        timestamp: Date.now(),
        tags: ['solution'],
        errorId: errorDoc.id,
        ...context
      }
    };

    await this.addDocuments([errorDoc, solutionDoc]);
    this.emit('errorSolutionIndexed', { errorId: errorDoc.id, solutionId: solutionDoc.id });
  }

  // Get collection statistics
  async getStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.getStats();
    }

    try {
      const count = await this.collection!.count();
      
      return {
        documentCount: count,
        collectionName: this.config.collectionName,
        initialized: this.isInitialized
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return null;
    }
  }

  // Clear all documents
  async clear() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.useSimpleDB && this.simpleDB) {
      return await this.simpleDB.clear();
    }

    try {
      await this.client!.deleteCollection({ name: this.config.collectionName! });
      this.collection = await this.client!.createCollection({
        name: this.config.collectionName!,
        embeddingFunction: this.embeddingFunction
      });
      
      this.emit('cleared');
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw error;
    }
  }

  // Delete specific documents
  async deleteDocuments(ids: string[]) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.collection!.delete({ ids });
      this.emit('documentsDeleted', { count: ids.length });
    } catch (error) {
      console.error('Failed to delete documents:', error);
      throw error;
    }
  }

  // Helper: Find files recursively
  private async findFiles(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    
    async function walk(directory: string) {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    }

    await walk(dir);
    return files;
  }

  // Helper: Split text into chunks
  private splitIntoChunks(text: string, maxLength: number): string[] {
    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  // Advanced search with context
  async searchWithContext(query: string, options?: {
    limit?: number;
    contextWindow?: number;
    types?: Document['metadata']['type'][];
  }): Promise<Array<SearchResult & { context?: string }>> {
    const results = await this.search(query, {
      limit: options?.limit || 5,
      filter: options?.types ? { type: { $in: options.types } } : undefined
    });

    // Enhance results with context
    const enhancedResults = await Promise.all(results.map(async (result) => {
      if (result.metadata.filePath && options?.contextWindow) {
        try {
          const content = await fs.readFile(result.metadata.filePath, 'utf-8');
          const lines = content.split('\n');
          const matchIndex = lines.findIndex(line => line.includes(result.text.substring(0, 50)));
          
          if (matchIndex >= 0) {
            const start = Math.max(0, matchIndex - options.contextWindow);
            const end = Math.min(lines.length, matchIndex + options.contextWindow + 1);
            const context = lines.slice(start, end).join('\n');
            
            return { ...result, context };
          }
        } catch {
          // Ignore errors reading context
        }
      }
      
      return result;
    }));

    return enhancedResults;
  }
}