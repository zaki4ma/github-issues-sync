import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';
import chalk from 'chalk';
import { 
  ensureDirectoryExists, 
  generateFilename, 
  formatDate, 
  categorizeIssuesByState, 
  cleanDirectory, 
  safeWriteFile, 
  getCurrentTimestamp 
} from './utils.js';
import { SyncTracker } from './syncTracker.js';
import { IssueAnalyzer } from './issueAnalyzer.js';
import { ImageAnalyzer } from './imageAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export class FileManager {
  constructor(config, githubClient = null) {
    this.config = config;
    this.templateConfig = config.getTemplateConfig();
    this.outputConfig = config.getOutputConfig();
    this.issueAnalyzer = new IssueAnalyzer();
    
    // Image analysis support
    if (githubClient) {
      this.imageAnalyzer = new ImageAnalyzer(config, githubClient);
    }
    
    // Enhanced template support
    this.enhancedTemplate = this.templateConfig.enhanced_issue || './templates/issue-enhanced.md';
    this.useEnhancedTemplate = config.getOutputConfig().use_enhanced_template !== false;
  }

  async writeIssues(issues, repositoryConfig, useIncrementalSync = true) {
    try {
      const outputDir = path.resolve(repositoryConfig.output_dir);
      console.log(chalk.blue(`Writing issues to ${outputDir}...`));

      const syncTracker = new SyncTracker(repositoryConfig);
      let issuesToProcess = issues;
      let syncStats = null;

      if (useIncrementalSync) {
        syncStats = await this.performIncrementalSync(issues, syncTracker, outputDir);
        issuesToProcess = [...syncStats.new, ...syncStats.updated];
        
        if (syncStats.total === 0) {
          console.log(chalk.yellow('No changes detected. Skipping file write.'));
          return [];
        }
        
        console.log(chalk.blue(`Incremental sync: ${syncStats.new.length} new, ${syncStats.updated.length} updated, ${syncStats.unchanged.length} unchanged, ${syncStats.deleted.length} deleted`));
      }

      if (this.outputConfig.clean_before_sync) {
        this.cleanOutputDirectory(outputDir);
      }

      let processedIssues = [];

      if (this.outputConfig.group_by_state) {
        processedIssues = await this.writeIssuesByState(issuesToProcess, outputDir, syncTracker);
      } else {
        processedIssues = await this.writeIssuesFlat(issuesToProcess, outputDir, syncTracker);
      }

      if (this.outputConfig.create_index) {
        // For index file, use all issues not just processed ones
        const allIssuesForIndex = useIncrementalSync ? issues : processedIssues;
        await this.writeIndexFile(allIssuesForIndex, outputDir);
      }

      if (useIncrementalSync) {
        syncTracker.updateLastSyncTime();
        syncTracker.saveSyncData();
      }

      const totalProcessed = useIncrementalSync ? syncStats.total : processedIssues.length;
      console.log(chalk.green(`✓ Successfully processed ${totalProcessed} issues (${processedIssues.length} written)`));
      return processedIssues;
    } catch (error) {
      console.error(chalk.red(`✗ Failed to write issues: ${error.message}`));
      throw error;
    }
  }

  async performIncrementalSync(issues, syncTracker, outputDir) {
    const changes = syncTracker.getChangedIssues(issues);
    
    // Clean up deleted issues
    if (changes.deleted.length > 0) {
      const cleanedFiles = syncTracker.cleanupDeletedIssues(changes.deleted);
      if (cleanedFiles.length > 0) {
        console.log(chalk.yellow(`Cleaned up ${cleanedFiles.length} deleted issue files`));
      }
    }
    
    // Handle state changes for all issues when auto_reorganize is enabled
    if (this.outputConfig.group_by_state && this.outputConfig.auto_reorganize !== false) {
      const allIssues = [...changes.new, ...changes.updated, ...changes.unchanged];
      let movedCount = 0;
      
      console.log(chalk.gray(`Checking state changes for ${allIssues.length} issues...`));
      
      for (const issue of allIssues) {
        const syncData = syncTracker.getIssueData(issue.number);
        if (syncData && syncData.filePath) {
          const currentState = this.categorizeIssue(issue);
          const previousState = this.categorizeIssueFromPath(syncData.filePath);
          
          // Debug logging (disabled for production)
          // console.log(chalk.gray(`Issue #${issue.number}: filePath=${syncData.filePath}, previousState=${previousState}, currentState=${currentState}`));
          
          if (issue.state === 'closed' && previousState !== 'done') {
            console.log(chalk.gray(`Issue #${issue.number}: closed but in ${previousState} folder`));
          }
          
          if (previousState && currentState !== previousState) {
            try {
              const previousPath = syncData.filePath;
              const filename = path.basename(previousPath);
              const newDir = path.join(outputDir, currentState);
              const newPath = path.join(newDir, filename);
              
              if (fs.existsSync(previousPath)) {
                ensureDirectoryExists(newDir);
                fs.renameSync(previousPath, newPath);
                console.log(chalk.blue(`📁 Moved issue #${issue.number} from ${previousState} to ${currentState}`));
                movedCount++;
                
                // Clean up empty directory
                await this.cleanupEmptyDirectory(path.dirname(previousPath));
              } else {
                console.log(chalk.yellow(`⚠️ File not found for issue #${issue.number}: ${previousPath}`));
              }
            } catch (error) {
              console.warn(chalk.yellow(`⚠️ Failed to move issue #${issue.number}: ${error.message}`));
            }
          }
        }
      }
      
      if (movedCount > 0) {
        console.log(chalk.green(`✓ Automatically reorganized ${movedCount} issues by state`));
      }
    }
    
    return {
      new: changes.new,
      updated: changes.updated,
      unchanged: changes.unchanged,
      deleted: changes.deleted,
      total: changes.new.length + changes.updated.length + changes.unchanged.length
    };
  }

  async writeIssuesByState(issues, outputDir, syncTracker = null) {
    const categories = categorizeIssuesByState(issues);
    const processedIssues = [];

    for (const [state, stateIssues] of Object.entries(categories)) {
      if (stateIssues.length === 0) continue;

      const stateDir = path.join(outputDir, state);
      ensureDirectoryExists(stateDir);

      for (const issue of stateIssues) {
        const filename = generateFilename(issue);
        const filePath = path.join(stateDir, filename);
        
        // Check if issue has changed state and needs to be moved
        if (syncTracker && this.outputConfig.auto_reorganize !== false) {
          await this.handleIssueStateChange(issue, outputDir, syncTracker);
        }
        
        await this.writeIssueFile(issue, filePath);
        
        if (syncTracker) {
          syncTracker.markIssueProcessed(issue, filePath);
        }
        
        processedIssues.push({
          ...issue,
          filename,
          category: state,
          filePath
        });
      }
    }

    return processedIssues;
  }

  async writeIssuesFlat(issues, outputDir, syncTracker = null) {
    ensureDirectoryExists(outputDir);
    const processedIssues = [];

    for (const issue of issues) {
      const filename = generateFilename(issue);
      const filePath = path.join(outputDir, filename);
      
      await this.writeIssueFile(issue, filePath);
      
      if (syncTracker) {
        syncTracker.markIssueProcessed(issue, filePath);
      }
      
      processedIssues.push({
        ...issue,
        filename,
        category: 'all',
        filePath
      });
    }

    return processedIssues;
  }

  async writeIssueFile(issue, filePath) {
    try {
      // Choose template based on configuration and issue complexity
      const processedIssue = await this.processIssueData(issue);
      let templatePath = this.templateConfig.issue;
      
      if (this.useEnhancedTemplate && (
        processedIssue.metadata.hasSubIssues || 
        processedIssue.metadata.hasTaskList || 
        processedIssue.metadata.hasRelationships ||
        processedIssue.metadata.complexity !== 'simple'
      )) {
        templatePath = this.enhancedTemplate;
      }
      
      const template = await this.loadTemplate(templatePath);
      const content = Mustache.render(template, processedIssue);
      
      safeWriteFile(filePath, content);
      
      // Log enhanced issue detection
      if (templatePath === this.enhancedTemplate) {
        console.log(chalk.gray(`  Enhanced template used for issue #${issue.number} (${processedIssue.metadata.complexity})`));
      }
    } catch (error) {
      console.error(chalk.red(`✗ Failed to write issue ${issue.number}: ${error.message}`));
      throw error;
    }
  }

  async writeIndexFile(issues, outputDir) {
    try {
      const template = await this.loadTemplate(this.templateConfig.index);
      
      // Process and categorize all issues for index
      const processedIssues = issues.map(issue => ({
        ...this.processIssueData(issue),
        category: this.categorizeIssue(issue)
      }));
      
      const indexData = this.prepareIndexData(processedIssues);
      const content = Mustache.render(template, indexData);
      
      const indexPath = path.join(outputDir, 'index.md');
      safeWriteFile(indexPath, content);
      
      console.log(chalk.green(`✓ Created index file: ${indexPath}`));
    } catch (error) {
      console.error(chalk.red(`✗ Failed to create index file: ${error.message}`));
      throw error;
    }
  }

  categorizeIssue(issue) {
    if (issue.state === 'closed') {
      return 'done';
    } else if (issue.labels && issue.labels.some(label => label.name.toLowerCase().includes('blocked'))) {
      return 'blocked';
    } else if (issue.labels && issue.labels.some(label => 
      label.name.toLowerCase().includes('in progress') || 
      label.name.toLowerCase().includes('active')
    )) {
      return 'active';
    } else {
      return 'todo';
    }
  }

  async loadTemplate(templatePath) {
    try {
      const fullPath = path.resolve(PROJECT_ROOT, templatePath);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Template not found: ${fullPath}`);
      }
      
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      console.error(chalk.red(`✗ Failed to load template: ${error.message}`));
      throw error;
    }
  }

  async processIssueData(issue) {
    // Analyze issue for sub-issues and relationships
    const analyzedIssue = this.issueAnalyzer.analyzeIssue(issue);
    
    // Generate enhanced markdown content
    const taskListMarkdown = this.issueAnalyzer.formatTaskListForMarkdown(analyzedIssue.taskList);
    const subIssuesMarkdown = this.issueAnalyzer.formatSubIssuesForMarkdown(analyzedIssue.subIssues);
    const relationshipsMarkdown = this.issueAnalyzer.formatRelationshipsForMarkdown(analyzedIssue.relationships);
    const progressBar = analyzedIssue.progress.total > 0 ? 
      this.issueAnalyzer.generateProgressBar(analyzedIssue.progress.percentage) : '';

    // Process comments if available
    const processedComments = this.processCommentsData(issue.comments || []);

    // Process images if enabled and available
    let imageData = { images: [], analyses: [] };
    if (this.imageAnalyzer && issue.imageProcessingResult) {
      imageData = issue.imageProcessingResult;
    }

    return {
      ...analyzedIssue,
      created_at: formatDate(issue.created_at),
      updated_at: formatDate(issue.updated_at),
      closed_at: issue.closed_at ? formatDate(issue.closed_at) : null,
      body: issue.body || 'No description provided.',
      labels: issue.labels || [],
      assignees: issue.assignees || [],
      milestone: issue.milestone || null,
      filename: generateFilename(issue),
      
      // Enhanced data for templates
      taskListMarkdown,
      subIssuesMarkdown,
      relationshipsMarkdown,
      progressBar,
      
      // Comments data
      comments: processedComments,
      
      // Image data
      imageData,
      
      // Summary data
      summary: this.issueAnalyzer.getIssueSummary(analyzedIssue)
    };
  }

  processCommentsData(comments) {
    if (!Array.isArray(comments) || comments.length === 0) {
      return [];
    }

    const commentsConfig = this.config.getCommentsConfig();
    
    return comments.map(comment => ({
      id: comment.id,
      user: {
        login: comment.user?.login || 'Unknown',
        avatar_url: comment.user?.avatar_url || null,
        html_url: comment.user?.html_url || null
      },
      body: comment.body || '',
      created_at: formatDate(comment.created_at),
      updated_at: formatDate(comment.updated_at),
      updated_at_formatted: comment.created_at !== comment.updated_at ? 
        formatDate(comment.updated_at) : null,
      html_url: comment.html_url || null,
      // Add metadata flag for enhanced display
      include_metadata: commentsConfig?.include_metadata !== false
    }));
  }

  prepareIndexData(processedIssues) {
    const categories = {
      active: [],
      todo: [],
      done: [],
      blocked: []
    };

    processedIssues.forEach(issue => {
      if (categories[issue.category]) {
        categories[issue.category].push(issue);
      }
    });

    return {
      timestamp: getCurrentTimestamp(),
      total_count: processedIssues.length,
      active_issues: categories.active.map(issue => this.processIssueData(issue)),
      active_count: categories.active.length,
      todo_issues: categories.todo.map(issue => this.processIssueData(issue)),
      todo_count: categories.todo.length,
      done_issues: categories.done.map(issue => this.processIssueData(issue)),
      done_count: categories.done.length,
      blocked_issues: categories.blocked.map(issue => this.processIssueData(issue)),
      blocked_count: categories.blocked.length
    };
  }

  cleanOutputDirectory(outputDir) {
    try {
      console.log(chalk.yellow(`Cleaning output directory: ${outputDir}`));
      
      if (this.outputConfig.group_by_state) {
        const stateDirectories = ['active', 'todo', 'done', 'blocked'];
        stateDirectories.forEach(state => {
          const stateDir = path.join(outputDir, state);
          cleanDirectory(stateDir);
        });
      } else {
        cleanDirectory(outputDir);
      }
      
      console.log(chalk.green('✓ Cleaned output directory'));
    } catch (error) {
      console.error(chalk.red(`✗ Failed to clean output directory: ${error.message}`));
      throw error;
    }
  }

  async validateOutputDirectory(outputDir) {
    try {
      const resolvedPath = path.resolve(outputDir);
      ensureDirectoryExists(resolvedPath);
      
      const testFilePath = path.join(resolvedPath, '.test-write');
      fs.writeFileSync(testFilePath, 'test');
      fs.unlinkSync(testFilePath);
      
      return true;
    } catch (error) {
      throw new Error(`Output directory is not writable: ${error.message}`);
    }
  }

  async handleIssueStateChange(issue, outputDir, syncTracker) {
    try {
      const currentState = this.categorizeIssue(issue);
      const filename = generateFilename(issue);
      const currentPath = path.join(outputDir, currentState, filename);
      
      // Get previous state from sync tracker
      const previousIssueData = syncTracker.getIssueData(issue.number);
      if (!previousIssueData || !previousIssueData.filePath) {
        return; // New issue or no previous file path, no need to move
      }
      
      const previousState = this.categorizeIssueFromPath(previousIssueData.filePath);
      
      if (previousState && previousState !== currentState) {
        const previousPath = previousIssueData.filePath;
        
        // Move file from previous state directory to current state directory
        if (fs.existsSync(previousPath)) {
          // Ensure target directory exists
          const targetDir = path.join(outputDir, currentState);
          ensureDirectoryExists(targetDir);
          
          // Move the file
          fs.renameSync(previousPath, currentPath);
          console.log(chalk.blue(`📁 Moved issue #${issue.number} from ${previousState} to ${currentState}`));
          
          // Clean up empty directories if needed
          await this.cleanupEmptyDirectory(path.dirname(previousPath));
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to handle state change for issue #${issue.number}: ${error.message}`));
    }
  }

  categorizeIssueFromPath(filePath) {
    const pathParts = filePath.split(path.sep);
    const stateFolder = pathParts[pathParts.length - 2]; // Get parent directory name
    
    // Map folder names to state categories
    const folderToState = {
      'todo': 'todo',
      'active': 'active', 
      'done': 'done',
      'blocked': 'blocked'
    };
    
    return folderToState[stateFolder] || null;
  }

  async cleanupEmptyDirectory(dirPath) {
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        if (files.length === 0) {
          fs.rmdirSync(dirPath);
          console.log(chalk.gray(`🗑️ Removed empty directory: ${dirPath}`));
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async reorganizeFilesByState(issues, repositoryConfig, dryRun = false) {
    try {
      const outputDir = path.resolve(repositoryConfig.output_dir);
      let movedCount = 0;
      
      if (!this.outputConfig.group_by_state) {
        console.log(chalk.yellow('Reorganization skipped: group_by_state is disabled'));
        return 0;
      }
      
      // Create issue map for quick lookup
      const issueMap = new Map();
      issues.forEach(issue => {
        issueMap.set(issue.number, issue);
      });
      
      // Scan all state directories for existing files
      const stateDirectories = ['active', 'todo', 'done', 'blocked'];
      
      for (const currentStateDir of stateDirectories) {
        const stateDirPath = path.join(outputDir, currentStateDir);
        
        if (!fs.existsSync(stateDirPath)) continue;
        
        const files = fs.readdirSync(stateDirPath).filter(file => file.endsWith('.md'));
        
        for (const filename of files) {
          try {
            // Extract issue number from filename (e.g., "2-issue.md" -> 2)
            const issueNumberMatch = filename.match(/^(\d+)-/);
            if (!issueNumberMatch) continue;
            
            const issueNumber = parseInt(issueNumberMatch[1]);
            const issue = issueMap.get(issueNumber);
            
            if (!issue) {
              console.log(chalk.gray(`⚠️ Issue #${issueNumber} no longer exists, keeping in ${currentStateDir}`));
              continue;
            }
            
            const expectedState = this.categorizeIssue(issue);
            
            if (currentStateDir !== expectedState) {
              const currentPath = path.join(stateDirPath, filename);
              const targetDir = path.join(outputDir, expectedState);
              const targetPath = path.join(targetDir, filename);
              
              if (dryRun) {
                console.log(chalk.blue(`📁 Would move: ${filename} from ${currentStateDir} to ${expectedState}`));
              } else {
                // Ensure target directory exists
                ensureDirectoryExists(targetDir);
                
                // Move the file
                fs.renameSync(currentPath, targetPath);
                console.log(chalk.blue(`📁 Moved: ${filename} from ${currentStateDir} to ${expectedState}`));
              }
              
              movedCount++;
            }
          } catch (error) {
            console.warn(chalk.yellow(`⚠️ Failed to process file ${filename}: ${error.message}`));
          }
        }
        
        // Clean up empty directories after moving files
        if (!dryRun) {
          await this.cleanupEmptyDirectory(stateDirPath);
        }
      }
      
      return movedCount;
    } catch (error) {
      console.error(chalk.red(`✗ Failed to reorganize files: ${error.message}`));
      throw error;
    }
  }

  getOutputDirectoryStats(outputDir) {
    try {
      const stats = {
        total_files: 0,
        by_state: {
          active: 0,
          todo: 0,
          done: 0,
          blocked: 0
        }
      };

      if (this.outputConfig.group_by_state) {
        Object.keys(stats.by_state).forEach(state => {
          const stateDir = path.join(outputDir, state);
          if (fs.existsSync(stateDir)) {
            const files = fs.readdirSync(stateDir).filter(file => file.endsWith('.md'));
            stats.by_state[state] = files.length;
            stats.total_files += files.length;
          }
        });
      } else {
        if (fs.existsSync(outputDir)) {
          const files = fs.readdirSync(outputDir).filter(file => file.endsWith('.md') && file !== 'index.md');
          stats.total_files = files.length;
        }
      }

      return stats;
    } catch (error) {
      console.error(chalk.red(`✗ Failed to get output directory stats: ${error.message}`));
      return null;
    }
  }
}