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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export class FileManager {
  constructor(config) {
    this.config = config;
    this.templateConfig = config.getTemplateConfig();
    this.outputConfig = config.getOutputConfig();
    this.issueAnalyzer = new IssueAnalyzer();
    
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
        syncStats = this.performIncrementalSync(issues, syncTracker);
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

  performIncrementalSync(issues, syncTracker) {
    const changes = syncTracker.getChangedIssues(issues);
    
    // Clean up deleted issues
    if (changes.deleted.length > 0) {
      const cleanedFiles = syncTracker.cleanupDeletedIssues(changes.deleted);
      if (cleanedFiles.length > 0) {
        console.log(chalk.yellow(`Cleaned up ${cleanedFiles.length} deleted issue files`));
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
      const processedIssue = this.processIssueData(issue);
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

  processIssueData(issue) {
    // Analyze issue for sub-issues and relationships
    const analyzedIssue = this.issueAnalyzer.analyzeIssue(issue);
    
    // Generate enhanced markdown content
    const taskListMarkdown = this.issueAnalyzer.formatTaskListForMarkdown(analyzedIssue.taskList);
    const subIssuesMarkdown = this.issueAnalyzer.formatSubIssuesForMarkdown(analyzedIssue.subIssues);
    const relationshipsMarkdown = this.issueAnalyzer.formatRelationshipsForMarkdown(analyzedIssue.relationships);
    const progressBar = analyzedIssue.progress.total > 0 ? 
      this.issueAnalyzer.generateProgressBar(analyzedIssue.progress.percentage) : '';

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
      
      // Summary data
      summary: this.issueAnalyzer.getIssueSummary(analyzedIssue)
    };
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
      
      console.log(chalk.green(`✓ Cleaned output directory`));
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