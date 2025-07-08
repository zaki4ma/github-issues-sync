import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import dotenv from 'dotenv';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export class ConfigManager {
  constructor() {
    this.config = null;
    this.envLoaded = false;
  }

  loadEnvironment() {
    if (this.envLoaded) return;
    
    const envPath = path.join(PROJECT_ROOT, '.env');
    const result = dotenv.config({ path: envPath });
    
    if (result.error) {
      console.log(chalk.yellow(`Warning: Could not load .env file: ${result.error.message}`));
    }
    
    this.envLoaded = true;
  }

  loadConfig(configPath = null) {
    this.loadEnvironment();
    
    const defaultConfigPath = path.join(PROJECT_ROOT, 'config.yml');
    const configFilePath = configPath || defaultConfigPath;
    
    try {
      if (!fs.existsSync(configFilePath)) {
        throw new Error(`Config file not found: ${configFilePath}`);
      }
      
      const configContent = fs.readFileSync(configFilePath, 'utf8');
      this.config = YAML.parse(configContent);
      
      this.validateConfig();
      this.substituteEnvironmentVariables();
      
      console.log(chalk.green(`✓ Config loaded from ${configFilePath}`));
      return this.config;
    } catch (error) {
      console.error(chalk.red(`✗ Failed to load config: ${error.message}`));
      throw error;
    }
  }

  validateConfig() {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }
    
    // Validate GitHub token
    if (!this.config.github?.token) {
      throw new Error('GitHub token is required in config');
    }
    
    // Validate repositories
    if (!this.config.repositories || !Array.isArray(this.config.repositories)) {
      throw new Error('Repositories array is required in config');
    }
    
    if (this.config.repositories.length === 0) {
      throw new Error('At least one repository must be configured');
    }
    
    // Validate each repository
    this.config.repositories.forEach((repo, index) => {
      if (!repo.owner || !repo.repo) {
        throw new Error(`Repository ${index + 1}: owner and repo are required`);
      }
      
      if (!repo.output_dir) {
        throw new Error(`Repository ${index + 1}: output_dir is required`);
      }
      
      // Set default values
      if (repo.enabled === undefined) {
        repo.enabled = true;
      }
      
      if (!repo.display_name) {
        repo.display_name = `${repo.owner}/${repo.repo}`;
      }
    });
  }

  substituteEnvironmentVariables() {
    const substituteValue = (value) => {
      if (typeof value === 'string') {
        return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          const envValue = process.env[varName];
          if (envValue === undefined) {
            throw new Error(`Environment variable ${varName} is not defined`);
          }
          return envValue;
        });
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return value.map(substituteValue);
        } else {
          const result = {};
          for (const [key, val] of Object.entries(value)) {
            result[key] = substituteValue(val);
          }
          return result;
        }
      }
      return value;
    };
    
    this.config = substituteValue(this.config);
  }

  getConfig() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  getGitHubToken() {
    return this.getConfig().github.token;
  }

  getRepositories() {
    return this.getConfig().repositories.filter(repo => repo.enabled !== false);
  }

  getAllRepositories() {
    return this.getConfig().repositories;
  }

  getRepositoryGroups() {
    return this.getConfig().repository_groups || {};
  }

  getRepositoriesByGroup(groupName) {
    const groups = this.getRepositoryGroups();
    if (!groups[groupName]) {
      throw new Error(`Repository group '${groupName}' not found`);
    }
    
    const groupRepos = groups[groupName];
    return this.getRepositories().filter(repo => 
      groupRepos.includes(`${repo.owner}/${repo.repo}`)
    );
  }

  getGlobalFilters() {
    return this.getConfig().filters || {
      states: ['open'],
      labels: [],
      label_mode: 'any',
      exclude_labels: [],
      assignee: null,
      creator: null,
      mentioned: null,
      since: null,
      until: null,
      sort: 'updated',
      direction: 'desc',
      query: null
    };
  }

  getTemplateConfig() {
    return this.getConfig().templates || {
      issue: './templates/issue.md',
      enhanced_issue: './templates/issue-enhanced.md',
      index: './templates/index.md'
    };
  }

  getOutputConfig() {
    return this.getConfig().output || {
      clean_before_sync: false,
      create_index: true,
      group_by_state: true,
      create_master_index: true,
      master_index_path: './docs/README.md',
      use_enhanced_template: true
    };
  }

  getPerformanceConfig() {
    return this.getConfig().performance || {
      concurrent_repos: 3,
      concurrent_requests: 2,
      rate_limit_delay: 100
    };
  }

  getCommentsConfig() {
    return this.getConfig().comments || {
      enabled: true,
      limit: 50,
      sort: 'created',
      direction: 'asc',
      since: null,
      include_metadata: true,
      timestamp_format: 'YYYY-MM-DD HH:mm:ss'
    };
  }

  getImagesConfig() {
    return this.getConfig().images || {
      enabled: true,
      download_enabled: true,
      analyze_enabled: true,
      output_analysis: true,
      download_directory: './downloaded_images',
      max_file_size: 10,
      cleanup_after_hours: 168,
      supported_formats: ['png', 'jpg', 'jpeg', 'gif', 'webp']
    };
  }

  getRepositoryConfig(owner, repo) {
    const repository = this.getRepositories().find(r => 
      r.owner === owner && r.repo === repo
    );
    
    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found in config`);
    }
    
    return repository;
  }

  getFiltersForRepository(owner, repo) {
    const repository = this.getRepositoryConfig(owner, repo);
    const filters = repository.filters || this.getGlobalFilters();
    
    // Convert states array to single state value for GitHub API
    if (filters.states && Array.isArray(filters.states)) {
      if (filters.states.includes('all') || 
          (filters.states.includes('open') && filters.states.includes('closed'))) {
        filters.state = 'all';
      } else if (filters.states.includes('open')) {
        filters.state = 'open';
      } else if (filters.states.includes('closed')) {
        filters.state = 'closed';
      } else {
        filters.state = 'open'; // default
      }
      delete filters.states; // Remove the array version
    }
    
    return filters;
  }

  createDefaultConfig() {
    const defaultConfigPath = path.join(PROJECT_ROOT, 'config.yml');
    const exampleConfigPath = path.join(PROJECT_ROOT, 'config.example.yml');
    
    if (fs.existsSync(defaultConfigPath)) {
      throw new Error('Config file already exists');
    }
    
    if (!fs.existsSync(exampleConfigPath)) {
      throw new Error('Example config file not found');
    }
    
    fs.copyFileSync(exampleConfigPath, defaultConfigPath);
    console.log(chalk.green(`✓ Created config file: ${defaultConfigPath}`));
    console.log(chalk.yellow('Please edit the config file with your GitHub token and repositories'));
  }
}