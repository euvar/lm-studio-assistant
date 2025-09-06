import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
import { ConversationCheckpoint } from './checkpoint-manager.js';

interface CloudProvider {
  name: string;
  upload(data: Buffer, key: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
  exists(key: string): Promise<boolean>;
}

interface SyncConfig {
  provider: 'github' | 's3' | 'dropbox' | 'google-drive' | 'local';
  credentials: any;
  encryptionKey?: string;
  autoSync?: boolean;
  syncInterval?: number;
  maxCheckpoints?: number;
}

interface SyncMetadata {
  id: string;
  checkpointId: string;
  timestamp: Date;
  size: number;
  hash: string;
  encrypted: boolean;
  provider: string;
  remoteKey: string;
}

export class CloudSyncManager extends EventEmitter {
  private provider: CloudProvider | null = null;
  private config: SyncConfig;
  private syncMetadata: Map<string, SyncMetadata> = new Map();
  private syncTimer?: NodeJS.Timeout;
  private isSyncing: boolean = false;
  private encryptionKey?: Buffer;

  constructor(config: SyncConfig) {
    super();
    this.config = config;
    this.initializeProvider();
    
    if (config.encryptionKey) {
      this.encryptionKey = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    }
    
    if (config.autoSync && config.syncInterval) {
      this.startAutoSync();
    }
  }

  private initializeProvider() {
    switch (this.config.provider) {
      case 'github':
        this.provider = new GitHubProvider(this.config.credentials);
        break;
      case 's3':
        this.provider = new S3Provider(this.config.credentials);
        break;
      case 'dropbox':
        this.provider = new DropboxProvider(this.config.credentials);
        break;
      case 'google-drive':
        this.provider = new GoogleDriveProvider(this.config.credentials);
        break;
      case 'local':
        this.provider = new LocalProvider(this.config.credentials);
        break;
      default:
        throw new Error(`Unsupported cloud provider: ${this.config.provider}`);
    }
  }

  // Upload checkpoint to cloud
  async uploadCheckpoint(checkpoint: ConversationCheckpoint): Promise<SyncMetadata> {
    if (!this.provider) throw new Error('No cloud provider configured');
    
    this.emit('uploadStarted', checkpoint.id);
    
    try {
      // Serialize checkpoint
      const data = Buffer.from(JSON.stringify(checkpoint));
      
      // Encrypt if needed
      const finalData = this.encryptionKey ? await this.encrypt(data) : data;
      
      // Generate remote key
      const remoteKey = `checkpoints/${checkpoint.id}_${Date.now()}.json${this.encryptionKey ? '.enc' : ''}`;
      
      // Upload
      const url = await this.provider.upload(finalData, remoteKey);
      
      // Create metadata
      const metadata: SyncMetadata = {
        id: crypto.randomUUID(),
        checkpointId: checkpoint.id,
        timestamp: new Date(),
        size: finalData.length,
        hash: crypto.createHash('sha256').update(finalData).digest('hex'),
        encrypted: !!this.encryptionKey,
        provider: this.config.provider,
        remoteKey
      };
      
      this.syncMetadata.set(checkpoint.id, metadata);
      await this.saveMetadata();
      
      this.emit('uploadCompleted', checkpoint.id, metadata);
      
      return metadata;
    } catch (error) {
      this.emit('uploadError', checkpoint.id, error);
      throw error;
    }
  }

  // Download checkpoint from cloud
  async downloadCheckpoint(checkpointId: string): Promise<ConversationCheckpoint | null> {
    if (!this.provider) throw new Error('No cloud provider configured');
    
    const metadata = this.syncMetadata.get(checkpointId);
    if (!metadata) return null;
    
    this.emit('downloadStarted', checkpointId);
    
    try {
      // Download data
      const encryptedData = await this.provider.download(metadata.remoteKey);
      
      // Verify hash
      const hash = crypto.createHash('sha256').update(encryptedData).digest('hex');
      if (hash !== metadata.hash) {
        throw new Error('Checkpoint data corrupted (hash mismatch)');
      }
      
      // Decrypt if needed
      const data = metadata.encrypted && this.encryptionKey 
        ? await this.decrypt(encryptedData)
        : encryptedData;
      
      // Parse checkpoint
      const checkpoint = JSON.parse(data.toString()) as ConversationCheckpoint;
      
      this.emit('downloadCompleted', checkpointId);
      
      return checkpoint;
    } catch (error) {
      this.emit('downloadError', checkpointId, error);
      throw error;
    }
  }

  // Sync all local checkpoints to cloud
  async syncAllCheckpoints(localCheckpoints: ConversationCheckpoint[]): Promise<void> {
    if (this.isSyncing) return;
    
    this.isSyncing = true;
    this.emit('syncStarted');
    
    try {
      const syncResults = {
        uploaded: 0,
        failed: 0,
        skipped: 0
      };
      
      for (const checkpoint of localCheckpoints) {
        if (this.syncMetadata.has(checkpoint.id)) {
          syncResults.skipped++;
          continue;
        }
        
        try {
          await this.uploadCheckpoint(checkpoint);
          syncResults.uploaded++;
        } catch (error) {
          console.error(`Failed to sync checkpoint ${checkpoint.id}:`, error);
          syncResults.failed++;
        }
      }
      
      // Clean up old checkpoints if limit exceeded
      if (this.config.maxCheckpoints) {
        await this.cleanupOldCheckpoints();
      }
      
      this.emit('syncCompleted', syncResults);
    } finally {
      this.isSyncing = false;
    }
  }

  // List remote checkpoints
  async listRemoteCheckpoints(): Promise<SyncMetadata[]> {
    if (!this.provider) throw new Error('No cloud provider configured');
    
    const remoteKeys = await this.provider.list('checkpoints/');
    const remoteMetadata: SyncMetadata[] = [];
    
    // Load metadata for each remote checkpoint
    for (const key of remoteKeys) {
      const checkpointId = this.extractCheckpointId(key);
      const metadata = this.syncMetadata.get(checkpointId);
      
      if (metadata) {
        remoteMetadata.push(metadata);
      }
    }
    
    return remoteMetadata.sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  // Delete checkpoint from cloud
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    if (!this.provider) throw new Error('No cloud provider configured');
    
    const metadata = this.syncMetadata.get(checkpointId);
    if (!metadata) return false;
    
    try {
      const deleted = await this.provider.delete(metadata.remoteKey);
      
      if (deleted) {
        this.syncMetadata.delete(checkpointId);
        await this.saveMetadata();
        this.emit('checkpointDeleted', checkpointId);
      }
      
      return deleted;
    } catch (error) {
      this.emit('deleteError', checkpointId, error);
      throw error;
    }
  }

  // Encrypt data
  private async encrypt(data: Buffer): Promise<Buffer> {
    if (!this.encryptionKey) throw new Error('Encryption key not set');
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    
    // Prepend IV to encrypted data
    return Buffer.concat([iv, encrypted]);
  }

  // Decrypt data
  private async decrypt(data: Buffer): Promise<Buffer> {
    if (!this.encryptionKey) throw new Error('Encryption key not set');
    
    // Extract IV from beginning
    const iv = data.slice(0, 16);
    const encrypted = data.slice(16);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  // Auto sync
  private startAutoSync() {
    this.syncTimer = setInterval(async () => {
      try {
        await this.syncAllCheckpoints([]);
      } catch (error) {
        console.error('Auto sync failed:', error);
      }
    }, this.config.syncInterval || 300000); // Default 5 minutes
  }

  // Stop auto sync
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  // Clean up old checkpoints
  private async cleanupOldCheckpoints() {
    const maxCheckpoints = this.config.maxCheckpoints || 50;
    const metadata = Array.from(this.syncMetadata.values());
    
    if (metadata.length <= maxCheckpoints) return;
    
    // Sort by timestamp, oldest first
    metadata.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Delete oldest checkpoints
    const toDelete = metadata.slice(0, metadata.length - maxCheckpoints);
    
    for (const meta of toDelete) {
      try {
        await this.deleteCheckpoint(meta.checkpointId);
      } catch (error) {
        console.error(`Failed to delete old checkpoint ${meta.checkpointId}:`, error);
      }
    }
  }

  // Save metadata locally
  private async saveMetadata() {
    const metadataPath = path.join(process.cwd(), '.lm-assistant', 'sync-metadata.json');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    
    const data = Array.from(this.syncMetadata.entries()).map(([checkpointId, meta]) => ({
      ...meta,
      timestamp: meta.timestamp.toISOString()
    }));
    
    await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
  }

  // Load metadata
  async loadMetadata() {
    const metadataPath = path.join(process.cwd(), '.lm-assistant', 'sync-metadata.json');
    
    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      const entries = JSON.parse(data);
      
      for (const entry of entries) {
        this.syncMetadata.set(entry.checkpointId, {
          ...entry,
          timestamp: new Date(entry.timestamp)
        });
      }
    } catch (error) {
      // Metadata file doesn't exist yet
    }
  }

  // Extract checkpoint ID from remote key
  private extractCheckpointId(remoteKey: string): string {
    const match = remoteKey.match(/checkpoints\/(.+?)_\d+\.json/);
    return match ? match[1] : '';
  }
}

// GitHub provider implementation
class GitHubProvider implements CloudProvider {
  name = 'github';
  private token: string;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(credentials: any) {
    this.token = credentials.token;
    this.owner = credentials.owner;
    this.repo = credentials.repo;
    this.branch = credentials.branch || 'main';
  }

  async upload(data: Buffer, key: string): Promise<string> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${key}`;
    
    const response = await axios.put(url, {
      message: `Upload checkpoint: ${key}`,
      content: data.toString('base64'),
      branch: this.branch
    }, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    return response.data.content.download_url;
  }

  async download(key: string): Promise<Buffer> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${key}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    return Buffer.from(response.data.content, 'base64');
  }

  async delete(key: string): Promise<boolean> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${key}`;
    
    // Get file SHA
    const fileResponse = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    // Delete file
    await axios.delete(url, {
      data: {
        message: `Delete checkpoint: ${key}`,
        sha: fileResponse.data.sha,
        branch: this.branch
      },
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    return true;
  }

  async list(prefix?: string): Promise<string[]> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${prefix || ''}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    return response.data
      .filter((item: any) => item.type === 'file')
      .map((item: any) => item.path);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${key}`;
      await axios.head(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      return true;
    } catch {
      return false;
    }
  }
}

// S3 provider (stub - requires AWS SDK)
class S3Provider implements CloudProvider {
  name = 's3';
  
  constructor(credentials: any) {
    // Initialize AWS S3 client
  }
  
  async upload(data: Buffer, key: string): Promise<string> {
    throw new Error('S3 provider not implemented');
  }
  
  async download(key: string): Promise<Buffer> {
    throw new Error('S3 provider not implemented');
  }
  
  async delete(key: string): Promise<boolean> {
    throw new Error('S3 provider not implemented');
  }
  
  async list(prefix?: string): Promise<string[]> {
    throw new Error('S3 provider not implemented');
  }
  
  async exists(key: string): Promise<boolean> {
    throw new Error('S3 provider not implemented');
  }
}

// Dropbox provider (stub)
class DropboxProvider implements CloudProvider {
  name = 'dropbox';
  
  constructor(credentials: any) {
    // Initialize Dropbox client
  }
  
  async upload(data: Buffer, key: string): Promise<string> {
    throw new Error('Dropbox provider not implemented');
  }
  
  async download(key: string): Promise<Buffer> {
    throw new Error('Dropbox provider not implemented');
  }
  
  async delete(key: string): Promise<boolean> {
    throw new Error('Dropbox provider not implemented');
  }
  
  async list(prefix?: string): Promise<string[]> {
    throw new Error('Dropbox provider not implemented');
  }
  
  async exists(key: string): Promise<boolean> {
    throw new Error('Dropbox provider not implemented');
  }
}

// Google Drive provider (stub)
class GoogleDriveProvider implements CloudProvider {
  name = 'google-drive';
  
  constructor(credentials: any) {
    // Initialize Google Drive client
  }
  
  async upload(data: Buffer, key: string): Promise<string> {
    throw new Error('Google Drive provider not implemented');
  }
  
  async download(key: string): Promise<Buffer> {
    throw new Error('Google Drive provider not implemented');
  }
  
  async delete(key: string): Promise<boolean> {
    throw new Error('Google Drive provider not implemented');
  }
  
  async list(prefix?: string): Promise<string[]> {
    throw new Error('Google Drive provider not implemented');
  }
  
  async exists(key: string): Promise<boolean> {
    throw new Error('Google Drive provider not implemented');
  }
}

// Local file system provider
class LocalProvider implements CloudProvider {
  name = 'local';
  private basePath: string;
  
  constructor(credentials: any) {
    this.basePath = credentials.path || path.join(process.cwd(), '.lm-assistant', 'cloud-sync');
  }
  
  async upload(data: Buffer, key: string): Promise<string> {
    const filePath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return `file://${filePath}`;
  }
  
  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key);
    return await fs.readFile(filePath);
  }
  
  async delete(key: string): Promise<boolean> {
    const filePath = path.join(this.basePath, key);
    await fs.unlink(filePath);
    return true;
  }
  
  async list(prefix?: string): Promise<string[]> {
    const searchPath = path.join(this.basePath, prefix || '');
    const files: string[] = [];
    
    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          files.push(path.relative(searchPath, fullPath));
        }
      }
    }
    
    await walk(searchPath);
    return files;
  }
  
  async exists(key: string): Promise<boolean> {
    try {
      const filePath = path.join(this.basePath, key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}