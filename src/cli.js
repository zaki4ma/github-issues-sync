#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { ConfigManager } from './config.js';
import { GitHubClient } from './github.js';
import { FileManager } from './fileManager.js';

const program = new Command();

program
  .name('gis')
  .description('GitHub Issues Sync - A CLI tool to sync GitHub Issues to local Markdown files')
  .version('0.1.0');

program
  .command('sync')
  .description('Sync issues from GitHub to local files')
  .option('-c, --config <path>', 'Path to config file', './config.yml')
  .option('-p, --project <name>', 'Sync specific project only')
  .option('-g, --group <name>', 'Sync specific repository group only')
  .option('--parallel', 'Process repositories in parallel (default: true)')
  .option('--no-parallel', 'Process repositories sequentially')
  .option('--incremental', 'Use incremental sync (default: true)')
  .option('--no-incremental', 'Force full sync, ignore previous sync data')
  .option('--force-reorganize', 'Force reorganization of files by current issue state')
  .option('--no-cache', 'Disable caching and fetch fresh data from GitHub')
  .option('--dry-run', 'Show what would be synced without actually syncing')
  .action(async (options) => {
    try {
      await syncCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show status of local files and GitHub issues')
  .option('-c, --config <path>', 'Path to config file', './config.yml')
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('reorganize')
  .description('Reorganize existing files by current issue state')
  .option('-c, --config <path>', 'Path to config file', './config.yml')
  .option('-p, --project <name>', 'Reorganize specific project only')
  .option('-g, --group <name>', 'Reorganize specific repository group only')
  .option('--no-cache', 'Disable caching and fetch fresh data from GitHub')
  .option('--dry-run', 'Show what would be moved without actually moving files')
  .action(async (options) => {
    try {
      await reorganizeCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration file')
  .action(async () => {
    try {
      await initCommand();
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

async function syncCommand(options) {
  const spinner = ora('Loading configuration...').start();
  
  try {
    const configManager = new ConfigManager();
    configManager.loadConfig(options.config);
    
    const performanceConfig = configManager.getPerformanceConfig();
    const githubClient = new GitHubClient(configManager.getGitHubToken(), {
      rateLimitDelay: performanceConfig.rate_limit_delay,
      useCache: options.cache !== false
    });
    const fileManager = new FileManager(configManager, githubClient);
    
    spinner.text = 'Testing GitHub connection...';
    const connected = await githubClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to GitHub');
    }
    
    let repositories = configManager.getRepositories();
    
    if (options.project) {
      const filteredRepos = repositories.filter(repo => 
        repo.repo === options.project || `${repo.owner}/${repo.repo}` === options.project
      );
      
      if (filteredRepos.length === 0) {
        throw new Error(`Project '${options.project}' not found in configuration`);
      }
      
      repositories = filteredRepos;
    } else if (options.group) {
      try {
        repositories = configManager.getRepositoriesByGroup(options.group);
        console.log(chalk.blue(`Processing repository group: ${options.group}`));
      } catch (error) {
        throw new Error(`Repository group error: ${error.message}`);
      }
    }
    
    spinner.stop();
    
    const useParallel = options.parallel !== false && repositories.length > 1;
    
    if (useParallel) {
      console.log(chalk.blue(`\\n🚀 Processing ${repositories.length} repositories in parallel...`));
      await processRepositoriesInParallel(repositories, options, configManager, githubClient, fileManager, performanceConfig);
    } else {
      console.log(chalk.blue(`\\n📁 Processing ${repositories.length} repositories sequentially...`));
      await processRepositoriesSequentially(repositories, options, configManager, githubClient, fileManager);
    }
    
    // Create master index if enabled
    const outputConfig = configManager.getOutputConfig();
    if (outputConfig.create_master_index && !options.dryRun) {
      await createMasterIndex(repositories, configManager, fileManager);
    }
    
    console.log(chalk.green('\\n🎉 Sync completed successfully!'));
    
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function statusCommand(options) {
  const spinner = ora('Loading configuration...').start();
  
  try {
    const configManager = new ConfigManager();
    configManager.loadConfig(options.config);
    
    const performanceConfig = configManager.getPerformanceConfig();
    const githubClient = new GitHubClient(configManager.getGitHubToken(), {
      rateLimitDelay: performanceConfig.rate_limit_delay,
      useCache: options.cache !== false
    });
    const fileManager = new FileManager(configManager, githubClient);
    
    spinner.text = 'Checking GitHub connection...';
    const connected = await githubClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to GitHub');
    }
    
    const repositories = configManager.getRepositories();
    spinner.stop();
    
    console.log(chalk.blue('\\n📊 Repository Status:\\n'));
    
    for (const repo of repositories) {
      console.log(chalk.bold(`${repo.owner}/${repo.repo}:`));
      
      try {
        const filters = configManager.getFiltersForRepository(repo.owner, repo.repo);
        const issues = await githubClient.safeGetIssues(repo.owner, repo.repo, filters);
        
        const stats = fileManager.getOutputDirectoryStats(repo.output_dir);
        
        console.log(`  GitHub Issues: ${issues.length}`);
        console.log(`  Local Files: ${stats ? stats.total_files : 'N/A'}`);
        
        if (stats && configManager.getOutputConfig().group_by_state) {
          console.log(`    Active: ${stats.by_state.active}`);
          console.log(`    Todo: ${stats.by_state.todo}`);
          console.log(`    Done: ${stats.by_state.done}`);
          console.log(`    Blocked: ${stats.by_state.blocked}`);
        }
        
      } catch (error) {
        console.log(chalk.red(`  Error: ${error.message}`));
      }
      
      console.log('');
    }
    
    const rateLimit = await githubClient.getRateLimit();
    if (rateLimit) {
      console.log(chalk.blue(`🔄 GitHub API Rate Limit: ${rateLimit.remaining}/${rateLimit.limit}`));
      console.log(chalk.blue(`   Reset time: ${new Date(rateLimit.reset * 1000).toLocaleString()}`));
    }
    
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function reorganizeCommand(options) {
  const spinner = ora('Loading configuration...').start();
  
  try {
    const configManager = new ConfigManager();
    configManager.loadConfig(options.config);
    
    const performanceConfig = configManager.getPerformanceConfig();
    const githubClient = new GitHubClient(configManager.getGitHubToken(), {
      rateLimitDelay: performanceConfig.rate_limit_delay,
      useCache: options.cache !== false
    });
    const fileManager = new FileManager(configManager, githubClient);
    
    spinner.text = 'Testing GitHub connection...';
    const connected = await githubClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to GitHub');
    }
    
    let repositories = configManager.getRepositories();
    
    if (options.project) {
      const filteredRepos = repositories.filter(repo => 
        repo.repo === options.project || `${repo.owner}/${repo.repo}` === options.project
      );
      
      if (filteredRepos.length === 0) {
        throw new Error(`Project '${options.project}' not found in configuration`);
      }
      
      repositories = filteredRepos;
    } else if (options.group) {
      try {
        repositories = configManager.getRepositoriesByGroup(options.group);
        console.log(chalk.blue(`Processing repository group: ${options.group}`));
      } catch (error) {
        throw new Error(`Repository group error: ${error.message}`);
      }
    }
    
    spinner.stop();
    
    console.log(chalk.blue(`\\n🗂️ Reorganizing ${repositories.length} repositories by current issue state...`));
    
    let totalMoved = 0;
    
    for (const repo of repositories) {
      console.log(chalk.blue(`\\n📁 Processing ${repo.display_name || repo.owner + '/' + repo.repo}...`));
      
      const reorgSpinner = ora('Fetching current issue states...').start();
      
      try {
        const filters = configManager.getFiltersForRepository(repo.owner, repo.repo);
        const issues = await githubClient.safeGetIssues(repo.owner, repo.repo, filters);
        
        reorgSpinner.text = 'Analyzing file organization...';
        const moved = await fileManager.reorganizeFilesByState(issues, repo, options.dryRun);
        totalMoved += moved;
        
        reorgSpinner.stop();
        console.log(chalk.green(`✓ ${options.dryRun ? 'Would move' : 'Moved'} ${moved} files`));
        
      } catch (error) {
        reorgSpinner.stop();
        console.error(chalk.red(`✗ Failed to reorganize ${repo.owner}/${repo.repo}: ${error.message}`));
      }
    }
    
    console.log(chalk.green(`\\n🎉 Reorganization completed! ${options.dryRun ? 'Would move' : 'Moved'} ${totalMoved} files total.`));
    
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function initCommand() {
  try {
    const configManager = new ConfigManager();
    configManager.createDefaultConfig();
    
    console.log(chalk.green('\\n🚀 GitHub Issues Sync initialized successfully!'));
    console.log(chalk.yellow('\\nNext steps:'));
    console.log('1. Create a GitHub Personal Access Token at: https://github.com/settings/tokens');
    console.log('2. Edit the .env file and set your GITHUB_TOKEN');
    console.log('3. Edit the config.yml file and configure your repositories');
    console.log('4. Run: gis sync');
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(chalk.yellow('Configuration already exists. Edit config.yml to make changes.'));
    } else {
      throw error;
    }
  }
}

async function processRepositoriesSequentially(repositories, options, configManager, githubClient, fileManager) {
  for (const repo of repositories) {
    await processRepository(repo, options, configManager, githubClient, fileManager);
  }
}

async function processRepositoriesInParallel(repositories, options, configManager, githubClient, fileManager, performanceConfig) {
  const concurrency = performanceConfig.concurrent_repos;
  const chunks = [];
  
  for (let i = 0; i < repositories.length; i += concurrency) {
    chunks.push(repositories.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(repo => 
      processRepository(repo, options, configManager, githubClient, fileManager)
    );
    
    await Promise.all(promises);
    
    // Add delay between chunks to respect rate limits
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, performanceConfig.rate_limit_delay));
    }
  }
}

async function processRepository(repo, options, configManager, githubClient, fileManager) {
  console.log(chalk.blue(`\\n📁 Processing ${repo.display_name || repo.owner + '/' + repo.repo}...`));
  
  const syncSpinner = ora('Fetching issues...').start();
  
  try {
    const filters = configManager.getFiltersForRepository(repo.owner, repo.repo);
    const issues = await githubClient.safeGetIssues(repo.owner, repo.repo, filters);
    
    // Check if comments sync is enabled
    const commentsConfig = configManager.getCommentsConfig();
    if (commentsConfig.enabled && issues.length > 0) {
      syncSpinner.text = `Fetching comments for ${issues.length} issues...`;
      
      const commentsOptions = {
        sort: commentsConfig.sort,
        direction: commentsConfig.direction,
        since: commentsConfig.since,
        per_page: Math.min(commentsConfig.limit, 100)
      };
      
      // Fetch comments for each issue
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        try {
          syncSpinner.text = `Fetching comments for issue #${issue.number} (${i + 1}/${issues.length})...`;
          const comments = await githubClient.safeGetIssueComments(
            repo.owner, 
            repo.repo, 
            issue.number, 
            commentsOptions
          );
          
          // Apply limit if specified
          const limitedComments = commentsConfig.limit && comments.length > commentsConfig.limit
            ? comments.slice(0, commentsConfig.limit)
            : comments;
          
          issue.comments = limitedComments;
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Failed to fetch comments for issue #${issue.number}: ${error.message}`));
          issue.comments = [];
        }
      }
      
      console.log(chalk.gray(`✓ Fetched comments for ${issues.length} issues`));
    }
    
    // Check if image processing is enabled
    const imagesConfig = configManager.getImagesConfig();
    if (imagesConfig.enabled && issues.length > 0) {
      syncSpinner.text = `Processing images for ${issues.length} issues...`;
      
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        try {
          syncSpinner.text = `Processing images for issue #${issue.number} (${i + 1}/${issues.length})...`;
          
          // Process images for this issue
          const imageProcessingResult = await fileManager.imageAnalyzer?.processIssueImages(issue);
          if (imageProcessingResult) {
            issue.imageProcessingResult = imageProcessingResult;
          }
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Failed to process images for issue #${issue.number}: ${error.message}`));
          issue.imageProcessingResult = { images: [], analyses: [] };
        }
      }
      
      const totalImages = issues.reduce((sum, issue) => sum + (issue.imageProcessingResult?.images?.length || 0), 0);
      if (totalImages > 0) {
        console.log(chalk.gray(`✓ Processed ${totalImages} images across ${issues.length} issues`));
      }
    }
    
    if (options.dryRun) {
      syncSpinner.stop();
      const totalComments = issues.reduce((sum, issue) => sum + (issue.comments?.length || 0), 0);
      const totalImages = issues.reduce((sum, issue) => sum + (issue.imageProcessingResult?.images?.length || 0), 0);
      console.log(chalk.yellow(`[DRY RUN] Would sync ${issues.length} issues with ${totalComments} comments and ${totalImages} images to ${repo.output_dir}`));
      return { repo, issues: [], success: true };
    }
    
    syncSpinner.text = 'Writing files...';
    const useIncrementalSync = options.incremental !== false;
    
    // Force reorganization if requested
    if (options.forceReorganize) {
      syncSpinner.text = 'Reorganizing files by current state...';
      await fileManager.reorganizeFilesByState(issues, repo, false);
    }
    
    const processedIssues = await fileManager.writeIssues(issues, repo, useIncrementalSync);
    
    syncSpinner.stop();
    const totalComments = issues.reduce((sum, issue) => sum + (issue.comments?.length || 0), 0);
    console.log(chalk.green(`✓ Successfully synced ${issues.length} issues with ${totalComments} comments`));
    
    return { repo, issues: processedIssues, success: true };
    
  } catch (error) {
    syncSpinner.stop();
    console.error(chalk.red(`✗ Failed to sync ${repo.owner}/${repo.repo}: ${error.message}`));
    return { repo, issues: [], success: false, error };
  }
}

async function createMasterIndex(repositories, configManager, fileManager) {
  try {
    const spinner = ora('Creating master index...').start();
    
    const outputConfig = configManager.getOutputConfig();
    const masterIndexPath = outputConfig.master_index_path;
    
    let masterContent = '# Projects Overview\\n\\n';
    masterContent += `**Last Updated:** ${new Date().toISOString()}\\n\\n`;
    
    for (const repo of repositories) {
      const stats = fileManager.getOutputDirectoryStats(repo.output_dir);
      const displayName = repo.display_name || `${repo.owner}/${repo.repo}`;
      
      masterContent += `## ${displayName}\\n\\n`;
      masterContent += `- **Repository:** [${repo.owner}/${repo.repo}](https://github.com/${repo.owner}/${repo.repo})\\n`;
      masterContent += `- **Issues:** ${stats ? stats.total_files : 'N/A'}\\n`;
      
      if (stats && outputConfig.group_by_state) {
        masterContent += `  - Active: ${stats.by_state.active}\\n`;
        masterContent += `  - Todo: ${stats.by_state.todo}\\n`;
        masterContent += `  - Done: ${stats.by_state.done}\\n`;
        masterContent += `  - Blocked: ${stats.by_state.blocked}\\n`;
      }
      
      if (outputConfig.create_index) {
        const indexPath = path.relative(path.dirname(masterIndexPath), path.join(repo.output_dir, 'index.md'));
        masterContent += `- **Details:** [View Issues](${indexPath})\\n`;
      }
      
      masterContent += '\\n';
    }
    
    const { safeWriteFile } = await import('./utils.js');
    safeWriteFile(masterIndexPath, masterContent);
    
    spinner.stop();
    console.log(chalk.green(`✓ Created master index: ${masterIndexPath}`));
    
  } catch (error) {
    console.error(chalk.red(`✗ Failed to create master index: ${error.message}`));
  }
}

program.parse();