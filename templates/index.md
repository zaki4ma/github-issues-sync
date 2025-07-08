# Issues Overview

**Last Updated:** {{timestamp}}  
**Total Issues:** {{total_count}}

{{#active_issues.length}}
## Active Issues ({{active_count}})

{{#active_issues}}
- [#{{number}} {{title}}](./active/{{filename}}) {{#labels}}`{{name}}` {{/labels}}
{{/active_issues}}
{{/active_issues.length}}

{{#todo_issues.length}}
## Todo Issues ({{todo_count}})

{{#todo_issues}}
- [#{{number}} {{title}}](./todo/{{filename}}) {{#labels}}`{{name}}` {{/labels}}
{{/todo_issues}}
{{/todo_issues.length}}

{{#done_issues.length}}
## Recently Completed ({{done_count}})

{{#done_issues}}
- [#{{number}} {{title}}](./done/{{filename}}) - Closed: {{closed_at}}
{{/done_issues}}
{{/done_issues.length}}

{{#blocked_issues.length}}
## Blocked Issues ({{blocked_count}})

{{#blocked_issues}}
- [#{{number}} {{title}}](./blocked/{{filename}}) {{#labels}}`{{name}}` {{/labels}}
{{/blocked_issues}}
{{/blocked_issues.length}}