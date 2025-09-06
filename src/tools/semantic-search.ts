import { Tool, ToolResult } from './base.js';
import { VectorDatabase } from '../core/vector-database.js';
import * as fs from 'fs/promises';

let vectorDB: VectorDatabase | null = null;

async function ensureVectorDB(): Promise<VectorDatabase> {
  if (!vectorDB) {
    vectorDB = new VectorDatabase({
      persistDirectory: './data/vectordb',
      useLocalEmbeddings: true
    });
    await vectorDB.initialize();
  }
  return vectorDB;
}

export const semanticSearchTool: Tool = {
  name: 'semanticSearch',
  description: 'Search for information using semantic similarity',
  async execute(params: { query: string; type?: string; limit?: number }): Promise<ToolResult> {
    try {
      const db = await ensureVectorDB();
      
      const results = params.type 
        ? await db.searchByType(params.query, params.type as any, params.limit || 5)
        : await db.search(params.query, { limit: params.limit || 5 });

      if (results.length === 0) {
        return {
          success: false,
          error: 'No relevant results found. Try indexing more content first.'
        };
      }

      const formattedResults = results.map((result, index) => ({
        rank: index + 1,
        score: (result.score * 100).toFixed(1) + '%',
        type: result.metadata.type,
        content: result.text.substring(0, 200) + (result.text.length > 200 ? '...' : ''),
        metadata: result.metadata
      }));

      return {
        success: true,
        data: formattedResults
      };
    } catch (error) {
      return {
        success: false,
        error: `Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const indexContentTool: Tool = {
  name: 'indexContent',
  description: 'Index content into the vector database for semantic search',
  async execute(params: { 
    content: string; 
    type: 'code' | 'documentation' | 'conversation' | 'error' | 'solution';
    metadata?: any 
  }): Promise<ToolResult> {
    try {
      const db = await ensureVectorDB();
      
      const doc = {
        id: Date.now().toString(),
        text: params.content,
        metadata: {
          type: params.type,
          timestamp: Date.now(),
          ...params.metadata
        }
      };

      await db.addDocument(doc);

      return {
        success: true,
        data: `Content indexed successfully with ID: ${doc.id}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to index content: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const indexDirectoryTool: Tool = {
  name: 'indexDirectory',
  description: 'Index all code files in a directory for semantic search',
  async execute(params: { path: string; extensions?: string[] }): Promise<ToolResult> {
    try {
      const db = await ensureVectorDB();
      
      // Check if directory exists
      try {
        const stat = await fs.stat(params.path);
        if (!stat.isDirectory()) {
          return {
            success: false,
            error: 'Path is not a directory'
          };
        }
      } catch {
        return {
          success: false,
          error: 'Directory does not exist'
        };
      }

      await db.indexCodeFiles(params.path, params.extensions);
      const stats = await db.getStats();

      return {
        success: true,
        data: `Successfully indexed directory. Total documents in database: ${stats?.documentCount || 0}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to index directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const findSimilarTool: Tool = {
  name: 'findSimilar',
  description: 'Find documents similar to a given document ID',
  async execute(params: { documentId: string; limit?: number }): Promise<ToolResult> {
    try {
      const db = await ensureVectorDB();
      
      const results = await db.findSimilar(params.documentId, params.limit || 5);

      if (results.length === 0) {
        return {
          success: false,
          error: 'No similar documents found'
        };
      }

      const formattedResults = results.map((result, index) => ({
        rank: index + 1,
        score: (result.score * 100).toFixed(1) + '%',
        type: result.metadata.type,
        content: result.text.substring(0, 200) + (result.text.length > 200 ? '...' : ''),
        metadata: result.metadata
      }));

      return {
        success: true,
        data: formattedResults
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to find similar documents: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const vectorDBStatsTool: Tool = {
  name: 'vectorDBStats',
  description: 'Get statistics about the vector database',
  async execute(): Promise<ToolResult> {
    try {
      const db = await ensureVectorDB();
      const stats = await db.getStats();

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const clearVectorDBTool: Tool = {
  name: 'clearVectorDB',
  description: 'Clear all documents from the vector database',
  async execute(params: { confirm: boolean }): Promise<ToolResult> {
    if (!params.confirm) {
      return {
        success: false,
        error: 'Please confirm the operation by setting confirm: true'
      };
    }

    try {
      const db = await ensureVectorDB();
      await db.clear();

      return {
        success: true,
        data: 'Vector database cleared successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to clear database: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};