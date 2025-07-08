# CLAUDE.md

回答は日本語で行ってください。モチベーションを維持できる回答をしてください。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub issues synchronization tool project. The project is currently in its initial state with no existing codebase.

## Development Setup

Since this is a new project, you'll need to initialize it first:

```bash
# Initialize Node.js project
npm init -y

# Install typical dependencies for a GitHub sync tool
npm install @octokit/rest dotenv

# Install development dependencies
npm install --save-dev typescript @types/node jest @types/jest ts-jest eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

## Suggested Project Structure

```
github-issues-sync/
├── src/
│   ├── index.ts          # Main entry point
│   ├── github/           # GitHub API integration
│   ├── sync/             # Synchronization logic
│   └── utils/            # Utility functions
├── tests/                # Test files
├── .env.example          # Environment variables template
├── tsconfig.json         # TypeScript configuration
├── jest.config.js        # Jest testing configuration
└── package.json          # Project dependencies and scripts
```

## Common Commands

Use these commands for development and operation:

```bash
# Run the sync tool
npm run start sync

# Sync specific project only
npm run start sync --project my-repo

# Sync repository group
npm run start sync --group personal

# Force full sync (disable incremental)
npm run start sync --no-incremental

# Run in parallel mode
npm run start sync --parallel

# Check sync status
npm run start status

# Initialize configuration
npm run start init

# Run tests
npm test

# Run linting
npm run lint
```

## Architecture Considerations

When implementing the GitHub issues synchronization:

1. **GitHub API Integration**: Use @octokit/rest for GitHub API interactions
2. **Configuration**: Store GitHub tokens and repository details in environment variables
3. **Sync Logic**: Implement bidirectional or unidirectional synchronization based on requirements
4. **Error Handling**: Implement robust error handling for API rate limits and network issues
5. **Logging**: Add structured logging for sync operations

## Claude Permissions

The `.claude/settings.local.json` file currently allows basic file system operations (ls, find, tree). Additional permissions may need to be added as the project develops.