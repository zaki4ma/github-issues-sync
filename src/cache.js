import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectoryExists } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export class CacheManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(PROJECT_ROOT, '.cache');
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = options.maxCacheSize || 100; // Maximum number of cache entries
    
    ensureDirectoryExists(this.cacheDir);
    this.cleanupExpiredEntries();
  }

  async generateCacheKey(prefix, params) {
    const normalizedParams = JSON.stringify(params, Object.keys(params).sort());
    const crypto = await import('crypto');
    const hash = crypto.createHash('md5').update(normalizedParams).digest('hex');
    return `${prefix}_${hash}`;
  }

  getCachePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  set(key, data, ttl = this.defaultTTL) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        ttl,
        expires: Date.now() + ttl
      };
      
      const cachePath = this.getCachePath(key);
      fs.writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));
      
      this.enforceMaxCacheSize();
    } catch (error) {
      console.warn(`Warning: Failed to write cache: ${error.message}`);
    }
  }

  get(key) {
    try {
      const cachePath = this.getCachePath(key);
      
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const cacheContent = fs.readFileSync(cachePath, 'utf8');
      const cacheEntry = JSON.parse(cacheContent);
      
      if (Date.now() > cacheEntry.expires) {
        this.delete(key);
        return null;
      }
      
      return cacheEntry.data;
    } catch (error) {
      console.warn(`Warning: Failed to read cache: ${error.message}`);
      return null;
    }
  }

  delete(key) {
    try {
      const cachePath = this.getCachePath(key);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (error) {
      console.warn(`Warning: Failed to delete cache: ${error.message}`);
    }
  }

  clear() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      });
    } catch (error) {
      console.warn(`Warning: Failed to clear cache: ${error.message}`);
    }
  }

  cleanupExpiredEntries() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      
      files.forEach(file => {
        if (!file.endsWith('.json')) return;
        
        try {
          const filePath = path.join(this.cacheDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const entry = JSON.parse(content);
          
          if (now > entry.expires) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          // If we can't parse the file, remove it
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      });
    } catch (error) {
      console.warn(`Warning: Failed to cleanup cache: ${error.message}`);
    }
  }

  enforceMaxCacheSize() {
    try {
      const files = fs.readdirSync(this.cacheDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          return { file, path: filePath, mtime: stats.mtime };
        })
        .sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first
      
      if (files.length > this.maxCacheSize) {
        const filesToDelete = files.slice(this.maxCacheSize);
        filesToDelete.forEach(({ path }) => {
          fs.unlinkSync(path);
        });
      }
    } catch (error) {
      console.warn(`Warning: Failed to enforce cache size limit: ${error.message}`);
    }
  }

  getStats() {
    try {
      const files = fs.readdirSync(this.cacheDir).filter(file => file.endsWith('.json'));
      const totalSize = files.reduce((size, file) => {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        return size + stats.size;
      }, 0);
      
      return {
        entries: files.length,
        totalSize: Math.round(totalSize / 1024), // KB
        maxEntries: this.maxCacheSize
      };
    } catch (error) {
      return { entries: 0, totalSize: 0, maxEntries: this.maxCacheSize };
    }
  }
}