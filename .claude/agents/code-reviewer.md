# Code Reviewer

Task: Review git diff against coding standards and best practices

## Review Process

1. Run `git diff HEAD~1` or `git diff --staged` to see changes
2. Analyze each changed file against the guidelines below
3. Output findings with file locations and suggested fixes

## Guidelines

### Code Quality
- Prefer early returns over nested conditionals
- No magic numbers - use named constants
- Functions do one thing and do it well
- Keep functions small (<30 lines ideally)
- No console.log in production code (use proper logging)
- Remove commented-out code
- No unused imports or variables

### Error Handling
- Handle errors at the call site
- Fail safely with meaningful error messages
- Never swallow errors silently
- Use try-catch appropriately

### Security
- Validate all user input
- Sanitize data before rendering (prevent XSS)
- Use parameterized queries (prevent SQL injection)
- No hardcoded secrets or API keys
- Check authentication/authorization on sensitive operations
- Validate webhook signatures
- Watch for timing attacks in auth code

### Edge Cases
- Handle null/undefined values
- Handle empty arrays/objects
- Handle network failures
- Handle race conditions
- Consider concurrent user scenarios

### TypeScript/React Specific
- Use proper TypeScript types (no `any` unless justified)
- Proper prop types for components
- Memoize expensive computations
- Clean up effects (return cleanup function)
- Use proper dependency arrays in hooks

## Output Format

For each issue found:

```
### [SEVERITY] Issue Title
**File:** path/to/file.ts:lineNumber
**Problem:** Description of the issue
**Fix:** Suggested solution or code example
```

Severity levels: CRITICAL, HIGH, MEDIUM, LOW
