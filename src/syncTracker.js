import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ensureDirectoryExists, safeWriteFile } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export class SyncTracker {
  constructor(repositoryConfig) {
    this.repoConfig = repositoryConfig;
    this.syncDataPath = path.join(PROJECT_ROOT, '.sync', `${repositoryConfig.owner}-${repositoryConfig.repo}.json`);
    this.syncData = this.loadSyncData();
  }

  loadSyncData() {
    try {
      if (fs.existsSync(this.syncDataPath)) {
        const data = fs.readFileSync(this.syncDataPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn(`Warning: Could not load sync data: ${error.message}`);
    }
    
    return {
      lastSync: null,
      issues: {},
      deletedIssues: [],
      version: '1.0'
    };
  }

  saveSyncData() {
    try {
      ensureDirectoryExists(path.dirname(this.syncDataPath));
      safeWriteFile(this.syncDataPath, JSON.stringify(this.syncData, null, 2));
    } catch (error) {
      console.warn(`Warning: Could not save sync data: ${error.message}`);
    }
  }

  generateIssueHash(issue) {
    const relevantData = {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      updated_at: issue.updated_at,
      labels: issue.labels?.map(l => l.name).sort(),
      assignees: issue.assignees?.map(a => a.login).sort(),
      milestone: issue.milestone?.title,
      // Include comments in hash calculation for change detection
      comments: issue.comments?.map(c => ({
        id: c.id,
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at,
        user: c.user?.login || 'Unknown'
      })) || [],
      // Include image processing results in hash calculation
      imageProcessingResult: issue.imageProcessingResult ? {
        imageCount: issue.imageProcessingResult.images?.length || 0,
        imageUrls: issue.imageProcessingResult.images?.map(img => img.originalUrl) || [],
        analysisCount: issue.imageProcessingResult.analyses?.length || 0
      } : null
    };
    
    const content = JSON.stringify(relevantData);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  needsUpdate(issue) {
    const issueKey = issue.number.toString();
    const currentHash = this.generateIssueHash(issue);
    
    if (!this.syncData.issues[issueKey]) {
      return { needed: true, reason: 'new' };
    }
    
    const storedHash = this.syncData.issues[issueKey].hash;
    if (storedHash !== currentHash) {
      return { needed: true, reason: 'updated' };
    }
    
    return { needed: false, reason: 'unchanged' };
  }

  markIssueProcessed(issue, filePath) {
    const issueKey = issue.number.toString();
    const hash = this.generateIssueHash(issue);
    
    this.syncData.issues[issueKey] = {
      hash,
      filePath,
      lastProcessed: new Date().toISOString(),
      state: issue.state
    };
  }

  getChangedIssues(issues) {
    const result = {
      new: [],
      updated: [],
      unchanged: [],
      deleted: []
    };
    
    const currentIssueNumbers = new Set(issues.map(i => i.number.toString()));
    
    // Check for new and updated issues
    for (const issue of issues) {
      const updateCheck = this.needsUpdate(issue);
      
      if (updateCheck.reason === 'new') {
        result.new.push(issue);
      } else if (updateCheck.reason === 'updated') {
        result.updated.push(issue);
      } else {
        result.unchanged.push(issue);
      }
    }
    
    // Check for deleted issues
    for (const [issueNumber, issueData] of Object.entries(this.syncData.issues)) {
      if (!currentIssueNumbers.has(issueNumber)) {
        result.deleted.push({
          number: parseInt(issueNumber),
          filePath: issueData.filePath,
          lastState: issueData.state
        });
      }
    }
    
    return result;
  }

  cleanupDeletedIssues(deletedIssues) {
    const cleanedFiles = [];
    
    for (const deleted of deletedIssues) {
      try {
        if (fs.existsSync(deleted.filePath)) {
          fs.unlinkSync(deleted.filePath);
          cleanedFiles.push(deleted.filePath);
        }
        
        // Remove from sync data
        delete this.syncData.issues[deleted.number.toString()];
      } catch (error) {
        console.warn(`Warning: Could not delete file ${deleted.filePath}: ${error.message}`);
      }
    }
    
    return cleanedFiles;
  }

  updateLastSyncTime() {
    this.syncData.lastSync = new Date().toISOString();
  }

  getLastSyncTime() {
    return this.syncData.lastSync;
  }

  getSyncStats() {
    const totalIssues = Object.keys(this.syncData.issues).length;
    const stateCount = {};
    
    for (const issueData of Object.values(this.syncData.issues)) {
      stateCount[issueData.state] = (stateCount[issueData.state] || 0) + 1;
    }
    
    return {
      totalIssues,
      stateCount,
      lastSync: this.syncData.lastSync
    };
  }

  getIssueData(issueNumber) {
    return this.syncData.issues[issueNumber.toString()] || null;
  }

  reset() {
    this.syncData = {
      lastSync: null,
      issues: {},
      deletedIssues: [],
      version: '1.0'
    };
    
    try {
      if (fs.existsSync(this.syncDataPath)) {
        fs.unlinkSync(this.syncDataPath);
      }
    } catch (error) {
      console.warn(`Warning: Could not reset sync data: ${error.message}`);
    }
  }
}