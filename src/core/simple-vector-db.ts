import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import natural from 'natural';

interface Document {
  id: string;
  text: string;
  embedding?: number[];
  metadata: {
    type: 'code' | 'documentation' | 'conversation' | 'error' | 'solution' | 'intent_example';
    filePath?: string;
    timestamp: number;
    language?: string;
    tags?: string[];
    intentType?: string;
  };
}

interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: any;
}

export class SimpleVectorDatabase extends EventEmitter {
  private documents: Map<string, Document> = new Map();
  private tfidf = new natural.TfIdf();
  private tokenizer = new natural.WordTokenizer();

  constructor() {
    super();
  }

  async initialize() {
    // No initialization needed for in-memory database
    this.emit('initialized');
  }

  // Simple TF-IDF based embeddings
  private generateEmbedding(text: string): number[] {
    const tokens = this.tokenizer.tokenize(text.toLowerCase()) || [];
    const termFreq: Record<string, number> = {};
    
    // Calculate term frequency
    tokens.forEach(token => {
      termFreq[token] = (termFreq[token] || 0) + 1;
    });

    // Convert to fixed-size vector (using hash trick)
    const vectorSize = 128;
    const vector = new Array(vectorSize).fill(0);
    
    Object.entries(termFreq).forEach(([term, freq]) => {
      const hash = crypto.createHash('md5').update(term).digest();
      const index = Math.abs(hash.readInt32BE(0)) % vectorSize;
      vector[index] += freq / tokens.length;
    });

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  // Calculate cosine similarity
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
    }
    
    return dotProduct; // Vectors are already normalized
  }

  async addDocument(doc: Document) {
    // Generate embedding if not provided
    if (!doc.embedding) {
      doc.embedding = this.generateEmbedding(doc.text);
    }

    this.documents.set(doc.id, doc);
    this.tfidf.addDocument(doc.text);
    
    this.emit('documentAdded', doc);
  }

  async addDocuments(docs: Document[]) {
    for (const doc of docs) {
      await this.addDocument(doc);
    }
    this.emit('documentsAdded', { count: docs.length });
  }

  async search(query: string, options?: {
    limit?: number;
    filter?: any;
  }): Promise<SearchResult[]> {
    const queryEmbedding = this.generateEmbedding(query);
    const results: Array<{ doc: Document; score: number }> = [];

    // Calculate similarity with all documents
    for (const doc of this.documents.values()) {
      // Apply filter if provided
      if (options?.filter) {
        let match = true;
        for (const [key, value] of Object.entries(options.filter)) {
          if ((doc.metadata as any)[key] !== value) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      if (doc.embedding) {
        const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({ doc, score });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const limited = results.slice(0, options?.limit || 5);

    const searchResults: SearchResult[] = limited.map(({ doc, score }) => ({
      id: doc.id,
      text: doc.text,
      score,
      metadata: doc.metadata
    }));

    this.emit('searchCompleted', { query, results: searchResults.length });
    return searchResults;
  }

  async searchByType(query: string, type: Document['metadata']['type'], limit: number = 5): Promise<SearchResult[]> {
    return await this.search(query, {
      limit,
      filter: { type }
    });
  }

  async findSimilar(documentId: string, limit: number = 5): Promise<SearchResult[]> {
    const doc = this.documents.get(documentId);
    if (!doc) return [];
    
    return await this.search(doc.text, { limit: limit + 1 })
      .then(results => results.filter(r => r.id !== documentId).slice(0, limit));
  }

  async indexConversation(messages: Array<{ role: string; content: string; timestamp?: number }>) {
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

  async indexErrorSolution(error: string, solution: string, context?: any) {
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
        ...context
      }
    };

    await this.addDocuments([errorDoc, solutionDoc]);
    this.emit('errorSolutionIndexed', { errorId: errorDoc.id, solutionId: solutionDoc.id });
  }

  async indexCodeFiles(directory: string, extensions: string[] = ['.ts', '.js', '.py', '.java', '.cpp']) {
    // This is simplified - in production would scan directory
    console.log(`Would index files from ${directory} with extensions ${extensions.join(', ')}`);
    this.emit('codeFilesIndexed', { count: 0, files: 0 });
  }

  async getStats() {
    return {
      documentCount: this.documents.size,
      collectionName: 'in-memory',
      initialized: true
    };
  }

  async clear() {
    this.documents.clear();
    this.tfidf = new natural.TfIdf();
    this.emit('cleared');
  }

  async deleteDocuments(ids: string[]) {
    for (const id of ids) {
      this.documents.delete(id);
    }
    this.emit('documentsDeleted', { count: ids.length });
  }

  // Enhanced search with context
  async searchWithContext(query: string, options?: {
    limit?: number;
    contextWindow?: number;
    types?: Document['metadata']['type'][];
  }): Promise<Array<SearchResult & { context?: string }>> {
    const results = await this.search(query, {
      limit: options?.limit || 5,
      filter: options?.types ? { type: { $in: options.types } } : undefined
    });

    return results.map(result => ({ ...result }));
  }
}