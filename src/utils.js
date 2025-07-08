import fs from 'fs';
import path from 'path';

export function createSlug(title) {
  if (!title || typeof title !== 'string') {
    return 'issue';
  }
  
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // If slug is empty (e.g., for non-ASCII characters), use a fallback
  return slug || 'issue';
}

export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function generateFilename(issue) {
  if (!issue || !issue.number) {
    return 'unknown-issue.md';
  }
  
  const slug = createSlug(issue.title || 'untitled');
  return `${issue.number}-${slug}.md`;
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function categorizeIssuesByState(issues) {
  const categories = {
    active: [],
    todo: [],
    done: [],
    blocked: []
  };

  issues.forEach(issue => {
    if (issue.state === 'closed') {
      categories.done.push(issue);
    } else if (issue.labels.some(label => label.name.toLowerCase().includes('blocked'))) {
      categories.blocked.push(issue);
    } else if (issue.labels.some(label => label.name.toLowerCase().includes('in progress') || 
                                         label.name.toLowerCase().includes('active'))) {
      categories.active.push(issue);
    } else {
      categories.todo.push(issue);
    }
  });

  return categories;
}

export function cleanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      cleanDirectory(filePath);
      fs.rmdirSync(filePath);
    } else if (file !== '.gitkeep') {
      fs.unlinkSync(filePath);
    }
  });
}

export function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }
  
  const normalizedPath = path.normalize(filePath);
  const resolvedPath = path.resolve(normalizedPath);
  
  return resolvedPath;
}

export function safeWriteFile(filePath, content) {
  const validatedPath = validateFilePath(filePath);
  const dir = path.dirname(validatedPath);
  
  ensureDirectoryExists(dir);
  fs.writeFileSync(validatedPath, content, 'utf8');
}

export function getCurrentTimestamp() {
  return new Date().toISOString();
}

export function truncateString(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

export function isValidGitHubUrl(url) {
  const githubUrlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/;
  return githubUrlPattern.test(url);
}

export function parseGitHubUrl(url) {
  const match = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)$/);
  if (!match) {
    throw new Error('Invalid GitHub issue URL');
  }
  
  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10)
  };
}

export function getRelativePath(from, to) {
  return path.relative(from, to);
}

export function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

export function isMarkdownFile(filename) {
  const ext = getFileExtension(filename);
  return ext === '.md' || ext === '.markdown';
}