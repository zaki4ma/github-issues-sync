# {{title}}

**Issue #{{number}}** | **{{state}}** | **Created: {{created_at}}** | **Complexity: {{metadata.complexity}}**

{{#progress.total}}
## Progress Overview

{{progressBar}} **{{progress.percentage}}%** ({{progress.completed}}/{{progress.total}})

{{/progress.total}}

{{#labels.length}}
## Labels
{{#labels}}
- `{{name}}`
{{/labels}}
{{/labels.length}}

{{#assignees.length}}
## Assignees
{{#assignees}}
- @{{login}}
{{/assignees}}
{{/assignees.length}}

{{#milestone}}
## Milestone
- {{title}} ({{state}})
{{/milestone}}

{{#taskListMarkdown}}
{{taskListMarkdown}}
{{/taskListMarkdown}}

{{#subIssuesMarkdown}}
{{subIssuesMarkdown}}
{{/subIssuesMarkdown}}

{{#relationshipsMarkdown}}
## Related Issues

{{relationshipsMarkdown}}
{{/relationshipsMarkdown}}

## Description

{{body}}

{{#metadata.hasSubIssues}}
---

## GitHub API Sub-Issues Summary

- **Total Sub-Issues:** {{progress.total}}
- **Completed:** {{progress.completed}}
- **Progress:** {{progress.percentage}}%
- **Data Source:** {{progress.source}}

{{/metadata.hasSubIssues}}

---

**Created:** {{created_at}}  
**Updated:** {{updated_at}}  
**URL:** [View on GitHub]({{html_url}})

{{#metadata.complexity}}
**Complexity Level:** {{metadata.complexity}}
{{/metadata.complexity}}