export class IssueAnalyzer {
  constructor() {
    this.relationshipPatterns = {
      closes: /(?:closes?|close|fix|fixes?|fixed|resolve|resolves?|resolved)\s+(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+)/gi,
      relates: /(?:relates?\s+to|related\s+to|see\s+also|references?)\s+(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+)/gi,
      depends: /(?:depends?\s+on|blocked\s+by|requires?)\s+(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+)/gi,
      blocks: /(?:blocks?|blocking)\s+(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+)/gi,
      duplicate: /(?:duplicate\s+of|duplicates?)\s+(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+)/gi
    };
    
    this.taskListPattern = /^[\s]*[-*+]\s+\[([ xX])\]\s+(.+)$/gm;
    this.subIssuePattern = /^[\s]*[-*+]\s+\[([ xX])\]\s+(.+?)(?:\s+(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+))?$/gm;
  }

  analyzeIssue(issue) {
    const body = issue.body || '';
    
    return {
      ...issue,
      relationships: this.extractRelationships(body),
      taskList: this.parseTaskList(body),
      subIssues: this.extractSubIssues(body),
      progress: this.calculateProgress(body, issue),
      metadata: this.extractMetadata(issue)
    };
  }

  extractRelationships(body) {
    const relationships = {
      closes: [],
      relates: [],
      depends: [],
      blocks: [],
      duplicate: []
    };

    for (const [type, pattern] of Object.entries(this.relationshipPatterns)) {
      const matches = [...body.matchAll(pattern)];
      relationships[type] = matches.map(match => ({
        issueNumber: parseInt(match[1]),
        originalText: match[0],
        url: match[0].includes('github.com') ? match[0] : `#${match[1]}`
      }));
    }

    return relationships;
  }

  parseTaskList(body) {
    const tasks = [];
    const matches = [...body.matchAll(this.taskListPattern)];
    
    for (const match of matches) {
      const isCompleted = match[1].toLowerCase() === 'x';
      const taskText = match[2].trim();
      
      // Extract issue number if present in task
      const issueMatch = taskText.match(/(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)(\d+)/);
      
      tasks.push({
        completed: isCompleted,
        text: taskText,
        originalText: match[0],
        issueNumber: issueMatch ? parseInt(issueMatch[1]) : null,
        type: issueMatch ? 'sub-issue' : 'task'
      });
    }

    return {
      tasks,
      total: tasks.length,
      completed: tasks.filter(t => t.completed).length,
      completionRate: tasks.length > 0 ? (tasks.filter(t => t.completed).length / tasks.length) * 100 : 0
    };
  }

  extractSubIssues(body) {
    const subIssues = [];
    const taskList = this.parseTaskList(body);
    
    // Extract sub-issues from task list
    for (const task of taskList.tasks) {
      if (task.type === 'sub-issue' && task.issueNumber) {
        subIssues.push({
          issueNumber: task.issueNumber,
          title: task.text.replace(/(?:#|https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/)\d+/, '').trim(),
          completed: task.completed,
          originalText: task.originalText
        });
      }
    }

    return {
      items: subIssues,
      total: subIssues.length,
      completed: subIssues.filter(si => si.completed).length,
      completionRate: subIssues.length > 0 ? (subIssues.filter(si => si.completed).length / subIssues.length) * 100 : 0
    };
  }

  calculateProgress(body, issue) {
    const taskList = this.parseTaskList(body);
    const apiProgress = issue.sub_issues_summary || {};
    
    // Use GitHub API data if available, otherwise use parsed data
    const total = apiProgress.total || taskList.total;
    const completed = apiProgress.completed || taskList.completed;
    const percentage = apiProgress.percent_completed || taskList.completionRate;

    return {
      total,
      completed,
      percentage: Math.round(percentage),
      source: apiProgress.total ? 'github_api' : 'parsed'
    };
  }

  extractMetadata(issue) {
    return {
      hasSubIssues: (issue.sub_issues_summary?.total || 0) > 0,
      hasTaskList: this.parseTaskList(issue.body || '').total > 0,
      hasRelationships: Object.values(this.extractRelationships(issue.body || '')).some(arr => arr.length > 0),
      complexity: this.calculateComplexity(issue)
    };
  }

  calculateComplexity(issue) {
    const body = issue.body || '';
    const relationships = this.extractRelationships(body);
    const taskList = this.parseTaskList(body);
    
    let complexity = 'simple';
    
    const totalRelationships = Object.values(relationships).reduce((sum, arr) => sum + arr.length, 0);
    
    if (taskList.total > 10 || totalRelationships > 5) {
      complexity = 'complex';
    } else if (taskList.total > 3 || totalRelationships > 2) {
      complexity = 'moderate';
    }
    
    return complexity;
  }

  generateProgressBar(percentage, length = 20) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  formatTaskListForMarkdown(taskList) {
    if (taskList.total === 0) return '';
    
    let output = `## Task Progress (${taskList.completed}/${taskList.total})\n\n`;
    output += `${this.generateProgressBar(taskList.completionRate)} ${Math.round(taskList.completionRate)}%\n\n`;
    
    if (taskList.tasks.length > 0) {
      output += '### Tasks\n\n';
      for (const task of taskList.tasks) {
        const checkbox = task.completed ? '[x]' : '[ ]';
        const status = task.completed ? '✅' : '⭕';
        output += `- ${checkbox} ${task.text} ${status}\n`;
      }
      output += '\n';
    }
    
    return output;
  }

  formatRelationshipsForMarkdown(relationships) {
    let output = '';
    
    const relationshipLabels = {
      closes: '🔒 Closes',
      relates: '🔗 Related to',
      depends: '⬆️ Depends on',
      blocks: '⬇️ Blocks',
      duplicate: '🔄 Duplicate of'
    };
    
    for (const [type, items] of Object.entries(relationships)) {
      if (items.length > 0) {
        output += `### ${relationshipLabels[type]}\n\n`;
        for (const item of items) {
          output += `- [#${item.issueNumber}](${item.url})\n`;
        }
        output += '\n';
      }
    }
    
    return output;
  }

  formatSubIssuesForMarkdown(subIssues) {
    if (subIssues.total === 0) return '';
    
    let output = `## Sub-Issues (${subIssues.completed}/${subIssues.total})\n\n`;
    output += `${this.generateProgressBar(subIssues.completionRate)} ${Math.round(subIssues.completionRate)}%\n\n`;
    
    if (subIssues.items.length > 0) {
      const completedItems = subIssues.items.filter(si => si.completed);
      const pendingItems = subIssues.items.filter(si => !si.completed);
      
      if (pendingItems.length > 0) {
        output += '### ⭕ Pending\n\n';
        for (const item of pendingItems) {
          output += `- [ ] [#${item.issueNumber}](#{item.issueNumber}) ${item.title}\n`;
        }
        output += '\n';
      }
      
      if (completedItems.length > 0) {
        output += '### ✅ Completed\n\n';
        for (const item of completedItems) {
          output += `- [x] [#${item.issueNumber}](#${item.issueNumber}) ${item.title}\n`;
        }
        output += '\n';
      }
    }
    
    return output;
  }

  getIssueSummary(analyzedIssue) {
    return {
      number: analyzedIssue.number,
      title: analyzedIssue.title,
      complexity: analyzedIssue.metadata.complexity,
      progress: analyzedIssue.progress,
      hasSubIssues: analyzedIssue.metadata.hasSubIssues,
      hasTaskList: analyzedIssue.metadata.hasTaskList,
      hasRelationships: analyzedIssue.metadata.hasRelationships,
      relationshipCount: Object.values(analyzedIssue.relationships).reduce((sum, arr) => sum + arr.length, 0)
    };
  }
}