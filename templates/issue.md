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

{{#comments.length}}
---

## Comments ({{comments.length}})

{{#comments}}
### {{user.login}} - {{created_at}}

{{body}}

{{#updated_at_formatted}}
*Last updated: {{updated_at_formatted}}*
{{/updated_at_formatted}}

---
{{/comments}}
{{/comments.length}}

{{#imageData.images.length}}
---

## Images ({{imageData.images.length}})

{{#imageData.images}}
### Image {{filename}}

{{#downloaded}}
- **Local Path**: `{{localPath}}`
{{/downloaded}}
- **Original URL**: [{{originalUrl}}]({{originalUrl}})

{{/imageData.images}}

{{#imageData.analyses.length}}
### Image Analysis Results

{{#imageData.analyses}}
#### {{filename}}

**Analysis Summary:**
{{analysis.description}}

{{#analysis.extractedText}}
**Extracted Text:**
```
{{analysis.extractedText}}
```
{{/analysis.extractedText}}

{{#analysis.detectedElements.length}}
**Detected Elements:**
{{#analysis.detectedElements}}
- {{.}}
{{/analysis.detectedElements}}
{{/analysis.detectedElements.length}}

---
{{/imageData.analyses}}
{{/imageData.analyses.length}}

{{/imageData.images.length}}

---

**Created:** {{created_at}}  
**Updated:** {{updated_at}}  
**URL:** [View on GitHub]({{html_url}})