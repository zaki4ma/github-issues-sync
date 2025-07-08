# {{title}}

**Issue #{{number}}** | **{{state}}** | **Created: {{created_at}}**

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

## Description

{{body}}

---

**Created:** {{created_at}}  
**Updated:** {{updated_at}}  
**URL:** [View on GitHub]({{html_url}})