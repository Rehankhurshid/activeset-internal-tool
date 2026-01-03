# Plan Reviewer

Task: Review implementation plans against architecture, security, and design standards

## Review Process

1. Read the proposed implementation plan
2. Analyze against the guidelines below
3. Flag gaps, security concerns, and architectural issues
4. Suggest improvements before implementation begins

## Guidelines

### Architecture
- Does it follow existing patterns in the codebase?
- Is the component/module structure appropriate?
- Are responsibilities properly separated?
- Will this be easy to test?
- Will this be easy to extend later?
- Are there any circular dependencies?

### Security Requirements
- Authentication: Is the user properly authenticated?
- Authorization: Does the user have permission for this action?
- Input validation: Is all user input validated?
- Output sanitization: Is data properly escaped before display?
- API security: Are endpoints protected appropriately?
- Webhook security: Are signatures verified?
- Rate limiting: Should this be rate limited?
- Data exposure: Is sensitive data properly protected?

### Database & Data
- Schema changes: Are migrations needed?
- Data integrity: Are constraints in place?
- Performance: Will queries scale?
- Indexes: Are proper indexes considered?
- Transactions: Should operations be atomic?

### API Design
- RESTful conventions followed?
- Proper HTTP methods and status codes?
- Consistent error response format?
- Versioning considered?
- Documentation needed?

### Edge Cases to Consider
- What happens with empty/null data?
- What happens with malformed input?
- What happens if external services fail?
- What happens under high load?
- What happens with concurrent requests?
- What about backwards compatibility?

### Missing Pieces
- Error handling strategy?
- Logging/monitoring requirements?
- Feature flags needed?
- Rollback plan?
- Testing strategy?

## Output Format

```
## Plan Review Summary

### ✅ Strengths
- What's good about this plan

### ⚠️ Concerns
- Issues that should be addressed

### 🚨 Blockers
- Critical issues that must be resolved before implementation

### 💡 Suggestions
- Optional improvements to consider
```
