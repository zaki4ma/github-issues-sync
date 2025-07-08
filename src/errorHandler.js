import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectoryExists, safeWriteFile } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export class ErrorHandler {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info'; // debug, info, warn, error
    this.logToFile = options.logToFile !== false;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.logDir = path.join(PROJECT_ROOT, 'logs');
    
    if (this.logToFile) {
      ensureDirectoryExists(this.logDir);
    }
  }

  log(level, message, error = null, context = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        status: error.status
      } : null
    };

    // Console output with colors
    this.logToConsole(level, message, error);

    // File logging
    if (this.logToFile) {
      this.logToFileSystem(logEntry);
    }
  }

  logToConsole(level, message, error) {
    const timestamp = new Date().toLocaleTimeString();
    let coloredMessage;

    switch (level) {
      case 'debug':
        coloredMessage = chalk.gray(`[${timestamp}] DEBUG: ${message}`);
        break;
      case 'info':
        coloredMessage = chalk.blue(`[${timestamp}] INFO: ${message}`);
        break;
      case 'warn':
        coloredMessage = chalk.yellow(`[${timestamp}] WARN: ${message}`);
        break;
      case 'error':
        coloredMessage = chalk.red(`[${timestamp}] ERROR: ${message}`);
        if (error) {
          coloredMessage += `\\n${chalk.red(error.stack || error.message)}`;
        }
        break;
      default:
        coloredMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    }

    console.log(coloredMessage);
  }

  logToFileSystem(logEntry) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `sync-${today}.log`);
      const logLine = JSON.stringify(logEntry) + '\\n';
      
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not write to log file: ${error.message}`));
    }
  }

  async retry(operation, context = {}, maxRetries = this.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.log('debug', `Attempt ${attempt}/${maxRetries}`, null, context);
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          this.log('error', `Operation failed after ${maxRetries} attempts`, error, context);
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.log('warn', `Attempt ${attempt} failed, retrying in ${delay}ms`, error, context);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // Network errors, rate limiting, temporary GitHub issues
    const retryableStatuses = [429, 500, 502, 503, 504];
    const retryableErrors = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
    
    if (error.status && retryableStatuses.includes(error.status)) {
      return true;
    }
    
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }
    
    return false;
  }

  async handleApiError(error, context = {}) {
    const errorInfo = {
      status: error.status,
      message: error.message,
      response: error.response?.data
    };

    switch (error.status) {
      case 401:
        this.log('error', 'Authentication failed - check your GitHub token', error, context);
        throw new Error('GitHub authentication failed. Please check your token and permissions.');
        
      case 403:
        if (error.message.includes('rate limit')) {
          this.log('warn', 'Rate limit exceeded, waiting before retry', error, context);
          const resetTime = error.response?.headers?.['x-ratelimit-reset'];
          if (resetTime) {
            const waitTime = (parseInt(resetTime) * 1000) - Date.now();
            if (waitTime > 0 && waitTime < 3600000) { // Max 1 hour wait
              await new Promise(resolve => setTimeout(resolve, waitTime));
              return; // Allow retry
            }
          }
        }
        this.log('error', 'GitHub API access forbidden', error, context);
        throw new Error('GitHub API access forbidden. Check your token permissions.');
        
      case 404:
        this.log('error', 'Repository or resource not found', error, context);
        throw new Error(`Repository or resource not found: ${context.owner}/${context.repo}`);
        
      case 422:
        this.log('error', 'Invalid request parameters', error, context);
        throw new Error('Invalid request parameters. Check your configuration.');
        
      case 429:
        this.log('warn', 'Rate limit exceeded', error, context);
        // This will be handled by retry logic
        throw error;
        
      default:
        if (this.isRetryableError(error)) {
          this.log('warn', 'Retryable error occurred', error, context);
          throw error;
        } else {
          this.log('error', 'Non-retryable error occurred', error, context);
          throw new Error(`GitHub API error: ${error.message}`);
        }
    }
  }

  async safeExecute(operation, context = {}, fallback = null) {
    try {
      if (this.isRetryableError.bind(this)) {
        return await this.retry(operation, context);
      } else {
        return await operation();
      }
    } catch (error) {
      this.log('error', 'Operation failed with non-retryable error', error, context);
      
      if (fallback) {
        this.log('info', 'Using fallback value', null, context);
        return fallback;
      }
      
      throw error;
    }
  }

  createRecoveryReport(errors) {
    const report = {
      timestamp: new Date().toISOString(),
      totalErrors: errors.length,
      errorsByType: {},
      recommendations: []
    };

    errors.forEach(error => {
      const type = error.type || 'unknown';
      report.errorsByType[type] = (report.errorsByType[type] || 0) + 1;
    });

    // Generate recommendations based on error patterns
    if (report.errorsByType['authentication']) {
      report.recommendations.push('Check your GitHub token and ensure it has the required permissions');
    }
    
    if (report.errorsByType['rate_limit']) {
      report.recommendations.push('Consider reducing the sync frequency or using incremental sync');
    }
    
    if (report.errorsByType['network']) {
      report.recommendations.push('Check your internet connection and GitHub API status');
    }

    return report;
  }

  async writeRecoveryReport(errors, outputPath) {
    try {
      const report = this.createRecoveryReport(errors);
      const reportContent = JSON.stringify(report, null, 2);
      
      safeWriteFile(outputPath, reportContent);
      this.log('info', `Recovery report written to ${outputPath}`);
    } catch (error) {
      this.log('error', 'Failed to write recovery report', error);
    }
  }

  getLogFilePath(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    return path.join(this.logDir, `sync-${dateStr}.log`);
  }

  async cleanupOldLogs(maxAge = 30) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoffDate) {
            fs.unlinkSync(filePath);
            this.log('debug', `Cleaned up old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to cleanup old logs', error);
    }
  }

  debug(message, context = {}) {
    if (this.logLevel === 'debug') {
      this.log('debug', message, null, context);
    }
  }

  info(message, context = {}) {
    this.log('info', message, null, context);
  }

  warn(message, error = null, context = {}) {
    this.log('warn', message, error, context);
  }

  error(message, error = null, context = {}) {
    this.log('error', message, error, context);
  }
}