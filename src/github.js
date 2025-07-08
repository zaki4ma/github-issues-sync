import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import { CacheManager } from './cache.js';
import { ErrorHandler } from './errorHandler.js';

export class GitHubClient {
  constructor(token, options = {}) {
    if (!token) {
      throw new Error('GitHub token is required');
    }
    
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'github-issues-sync/0.1.0',
    });
    
    this.cache = new CacheManager({
      defaultTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
      maxCacheSize: options.maxCacheSize || 100
    });
    
    this.useCache = options.useCache !== false;
    this.rateLimitDelay = options.rateLimitDelay || 100;
    this.lastRequestTime = 0;
    
    this.errorHandler = new ErrorHandler({
      logLevel: options.logLevel || 'info',
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000
    });
  }

  async testConnection() {
    try {
      const { data } = await this.octokit.rest.users.getAuthenticated();
      console.log(chalk.green(`✓ Connected to GitHub as ${data.login}`));
      return true;
    } catch (error) {
      console.error(chalk.red(`✗ Failed to connect to GitHub: ${error.message}`));
      return false;
    }
  }

  async getIssues(owner, repo, options = {}) {
    const {
      state = 'open',
      labels = [],
      label_mode = 'any',
      exclude_labels = [],
      assignee = null,
      creator = null,
      mentioned = null,
      since = null,
      until = null,
      sort = 'updated',
      direction = 'desc',
      query = null,
      per_page = 100
    } = options;

    try {
      console.log(chalk.blue(`Fetching issues from ${owner}/${repo}...`));
      
      // Check cache first
      const cacheKey = await this.cache.generateCacheKey('issues', { owner, repo, options });
      if (this.useCache) {
        const cachedIssues = this.cache.get(cacheKey);
        if (cachedIssues) {
          console.log(chalk.gray(`✓ Found ${cachedIssues.length} issues (cached)`));
          return cachedIssues;
        }
      }
      
      await this.respectRateLimit();
      
      let issues;
      
      // Use search API for complex queries
      if (query || since || until || creator || mentioned || exclude_labels.length > 0) {
        issues = await this.searchIssues(owner, repo, options);
      } else {
        // Use standard issues API for simple queries
        const params = {
          owner,
          repo,
          state,
          sort,
          direction,
          per_page
        };

        if (labels.length > 0) {
          params.labels = this.buildLabelsQuery(labels, label_mode);
        }

        if (assignee) {
          params.assignee = assignee;
        }

        const response = await this.octokit.rest.issues.listForRepo(params);
        
        // Filter out pull requests (GitHub API returns both issues and PRs)
        issues = response.data.filter(issue => !issue.pull_request);
        
        // Apply client-side filtering for options not supported by API
        issues = this.applyClientSideFilters(issues, options);
      }
      
      // Cache the results
      if (this.useCache) {
        this.cache.set(cacheKey, issues);
      }
      
      console.log(chalk.green(`✓ Found ${issues.length} issues`));
      return issues;
    } catch (error) {
      const context = { operation: 'getIssues', owner, repo, options };
      
      if (this.errorHandler.isRetryableError(error)) {
        throw error; // Will be handled by retry logic if called from safeExecute
      } else {
        await this.errorHandler.handleApiError(error, context);
      }
    }
  }

  async respectRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async searchIssues(owner, repo, options) {
    const {
      state = 'open',
      labels = [],
      label_mode = 'any',
      exclude_labels = [],
      assignee = null,
      creator = null,
      mentioned = null,
      since = null,
      until = null,
      sort = 'updated',
      direction = 'desc',
      query = null,
      per_page = 100
    } = options;

    try {
      let searchQuery = `repo:${owner}/${repo} is:issue`;
      
      // Custom query takes precedence
      if (query) {
        searchQuery = `${query} repo:${owner}/${repo}`;
      } else {
        // Build search query from filters
        if (state !== 'all') {
          searchQuery += ` is:${state}`;
        }
        
        if (labels.length > 0) {
          if (label_mode === 'all') {
            labels.forEach(label => {
              searchQuery += ` label:"${label}"`;
            });
          } else if (label_mode === 'any') {
            const labelList = labels.map(l => `"${l}"`).join(',');
            searchQuery += ` label:${labelList}`;
          }
        }
        
        exclude_labels.forEach(label => {
          searchQuery += ` -label:"${label}"`;
        });
        
        if (assignee === 'none') {
          searchQuery += ' no:assignee';
        } else if (assignee) {
          searchQuery += ` assignee:${assignee}`;
        }
        
        if (creator) {
          searchQuery += ` author:${creator}`;
        }
        
        if (mentioned) {
          searchQuery += ` mentions:${mentioned}`;
        }
        
        if (since) {
          searchQuery += ` updated:>=${since}`;
        }
        
        if (until) {
          searchQuery += ` updated:<=${until}`;
        }
      }
      
      console.log(chalk.gray(`Search query: ${searchQuery}`));
      
      await this.respectRateLimit();
      
      const response = await this.octokit.rest.search.issuesAndPullRequests({
        q: searchQuery,
        sort,
        order: direction,
        per_page
      });
      
      // Filter out pull requests
      const issues = response.data.items.filter(item => !item.pull_request);
      
      console.log(chalk.green(`✓ Found ${issues.length} issues via search`));
      return issues;
    } catch (error) {
      console.error(chalk.red(`✗ Search failed: ${error.message}`));
      throw error;
    }
  }

  buildLabelsQuery(labels, mode) {
    if (mode === 'all') {
      // GitHub API doesn't support AND logic for labels directly
      // We'll handle this with client-side filtering
      return labels.join(',');
    } else if (mode === 'none') {
      // This will be handled by exclude_labels in search
      return '';
    } else {
      // Default: any
      return labels.join(',');
    }
  }

  applyClientSideFilters(issues, options) {
    const {
      labels = [],
      label_mode = 'any',
      exclude_labels = []
    } = options;
    
    let filtered = issues;
    
    // Apply label filtering for 'all' mode
    if (labels.length > 0 && label_mode === 'all') {
      filtered = filtered.filter(issue => {
        const issueLabels = issue.labels.map(l => l.name);
        return labels.every(label => issueLabels.includes(label));
      });
    }
    
    // Apply exclude labels
    if (exclude_labels.length > 0) {
      filtered = filtered.filter(issue => {
        const issueLabels = issue.labels.map(l => l.name);
        return !exclude_labels.some(label => issueLabels.includes(label));
      });
    }
    
    return filtered;
  }

  async getRepository(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner,
        repo
      });
      return data;
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found or not accessible`);
      } else if (error.status === 401) {
        throw new Error('Authentication failed. Please check your GitHub token');
      } else {
        throw error;
      }
    }
  }

  async getRateLimit() {
    try {
      const { data } = await this.octokit.rest.rateLimit.get();
      return data.rate;
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not get rate limit info: ${error.message}`));
      return null;
    }
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  clearCache() {
    this.cache.clear();
    console.log(chalk.green('✓ Cache cleared'));
  }

  setCacheEnabled(enabled) {
    this.useCache = enabled;
    console.log(chalk.blue(`Cache ${enabled ? 'enabled' : 'disabled'}`));
  }

  async safeGetIssues(owner, repo, options = {}) {
    const context = { operation: 'safeGetIssues', owner, repo };
    
    return await this.errorHandler.safeExecute(
      () => this.getIssues(owner, repo, options),
      context,
      [] // fallback to empty array if all retries fail
    );
  }

  async getIssueComments(owner, repo, issueNumber, options = {}) {
    const {
      sort = 'created',
      direction = 'asc',
      since = null,
      per_page = 100
    } = options;

    try {
      console.log(chalk.blue(`Fetching comments for issue #${issueNumber} from ${owner}/${repo}...`));
      
      // Check cache first
      const cacheKey = await this.cache.generateCacheKey('comments', { 
        owner, repo, issueNumber, options 
      });
      if (this.useCache) {
        const cachedComments = this.cache.get(cacheKey);
        if (cachedComments) {
          console.log(chalk.gray(`✓ Found ${cachedComments.length} comments (cached)`));
          return cachedComments;
        }
      }
      
      await this.respectRateLimit();
      
      const params = {
        owner,
        repo,
        issue_number: issueNumber,
        sort,
        direction,
        per_page
      };

      if (since) {
        params.since = since;
      }

      const response = await this.octokit.rest.issues.listComments(params);
      const comments = response.data;
      
      // Cache the results
      if (this.useCache) {
        this.cache.set(cacheKey, comments);
      }
      
      console.log(chalk.green(`✓ Found ${comments.length} comments for issue #${issueNumber}`));
      return comments;
    } catch (error) {
      const context = { operation: 'getIssueComments', owner, repo, issueNumber, options };
      
      if (this.errorHandler.isRetryableError(error)) {
        throw error;
      } else {
        await this.errorHandler.handleApiError(error, context);
      }
    }
  }

  async createIssueComment(owner, repo, issueNumber, body) {
    try {
      console.log(chalk.blue(`Creating comment on issue #${issueNumber} in ${owner}/${repo}...`));
      
      await this.respectRateLimit();
      
      const response = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body
      });
      
      // Invalidate cache for this issue's comments
      const cacheKey = await this.cache.generateCacheKey('comments', { 
        owner, repo, issueNumber 
      });
      this.cache.delete(cacheKey);
      
      console.log(chalk.green(`✓ Comment created on issue #${issueNumber}`));
      return response.data;
    } catch (error) {
      const context = { operation: 'createIssueComment', owner, repo, issueNumber };
      await this.errorHandler.handleApiError(error, context);
    }
  }

  async safeGetIssueComments(owner, repo, issueNumber, options = {}) {
    const context = { operation: 'safeGetIssueComments', owner, repo, issueNumber };
    
    return await this.errorHandler.safeExecute(
      () => this.getIssueComments(owner, repo, issueNumber, options),
      context,
      [] // fallback to empty array if all retries fail
    );
  }

  getErrorHandler() {
    return this.errorHandler;
  }
}