# AI Fix Generation API Contract

## Endpoint: POST /fixes/generate

### Purpose
Generate an AI-powered fix for an error, create a branch with the fix, and generate a Pull Request on GitHub.

---

## Request

### Method
```
POST /fixes/generate
```

### Headers
```
Content-Type: application/json
Authorization: (optional, if authentication is required)
```

### Body Schema

```python
{
  "repo_name": str,           # Required: Repository name (e.g., "Clone_Demo_Repo")
  "error_message": str,       # Required: Error message/description
  "prompt": str               # Required: Custom instructions for AI analysis
}
```

### Request Example

```json
{
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties of undefined (reading 'map')\n\nStack trace:\n  at ErrorDetail.jsx:45:12\n  at processErrors function",
  "prompt": "The error occurs when trying to iterate over error.details array which is undefined. Please:\n1. Add null checking\n2. Implement a fallback\n3. Add TypeScript type guards"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_name` | string | Yes | Name of the repository (matches GitHub repo) |
| `error_message` | string | Yes | Full error message with context, stack trace, etc. |
| `prompt` | string | Yes | Custom instructions/context for AI analysis |

---

## Response

### Success Response (HTTP 200)

```json
{
  "success": true,
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties of undefined (reading 'map')",
  "fix": "{\"rca\": \"The error.details array is not checked for null...\", ...}",
  "pr_info": {
    "pr_url": "https://github.com/vineetkumar2016/Clone_Demo_Repo/pull/42",
    "pr_number": 42,
    "branch_name": "fix/ai-detected-error-240423-1430",
    "status": "Created"
  },
  "jira_info": {},
  "files_modified": 1,
  "generated_at": "2024-04-23T14:30:00.123456Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the operation succeeded |
| `repo_name` | string | The repository name (echoed from request) |
| `error_message` | string | The error message (echoed from request) |
| `fix` | string | AI-generated fix response (JSON string) |
| `pr_info` | object | Pull request creation details |
| `pr_info.pr_url` | string | URL to the created GitHub PR |
| `pr_info.pr_number` | integer | PR number on GitHub |
| `pr_info.branch_name` | string | Branch name created for the fix |
| `pr_info.status` | string | Status of PR creation ("Created", "Exists", etc.) |
| `jira_info` | object | JIRA ticket info (if created) |
| `files_modified` | integer | Number of files modified |
| `generated_at` | string | ISO-8601 timestamp of generation |

### Fix Structure

The `fix` field contains a JSON string with the AI analysis:

```json
{
  "rca": "Root cause analysis description",
  "explanation": "Detailed explanation of what was fixed",
  "severity": "high|medium|low",
  "proposed_changes": [
    {
      "file": "src/pages/ErrorDetail.jsx",
      "description": "Added null checking before accessing details array",
      "old_code": "error.details.map(item => { ... })",
      "new_code": "error?.details?.map(item => { ... })"
    }
  ],
  "testing_notes": "Test by triggering the error with missing details property"
}
```

---

## Error Responses

### 500 - Internal Server Error

```json
{
  "detail": "Error generating fix: [error message]"
}
```

### Common Error Scenarios

#### GitHub Not Configured
```json
{
  "detail": "Error generating fix: Error: GitHub token or organization not configured. Please configure GitHub settings first."
}
```

**Solution:** Configure GitHub settings in Settings > GitHub

#### AI API Not Configured
```json
{
  "detail": "Error generating fix: Error: AI API key not configured. Please configure AI settings first."
}
```

**Solution:** Configure AI API key in Settings > AI Models

#### Repository Clone Failed
```json
{
  "detail": "Error generating fix: Error executing git command: fatal: repository not found"
}
```

**Solution:** Verify repository name and GitHub token access

#### Branch Creation Failed
```json
{
  "detail": "Error generating fix: GitHub API error 404"
}
```

**Solution:** Verify organization and repository names

---

## Workflow Steps

### Step 1: Request Submission
Client sends POST request with error details

### Step 2: Configuration Validation
- Check GitHub token is configured
- Check AI API key is configured
- Return error if missing

### Step 3: AI Analysis
- Initialize AI client
- Build comprehensive analysis prompt
- Call Gemini AI API
- Receive JSON response with RCA and fixes

### Step 4: Git Operations
- Clone repository to temporary directory
- Configure git user
- Create feature branch
- Apply proposed code changes
- Create commit with descriptive message
- Push branch to GitHub

### Step 5: PR Creation
- Create pull request via GitHub API
- Include AI analysis in PR body
- Return PR number and URL

### Step 6: Response
- Return success with PR details

---

## Implementation Details

### Generated Branch Name Format
```
fix/ai-detected-error-YYMMDD-HHMM

Example: fix/ai-detected-error-240423-1430
```

### Commit Message Format
```
fix: AI-generated fix for {error_message_first_80_chars}

Body:
- RCA: {root_cause_analysis}
- Severity: {severity_level}
- Testing: {testing_notes}
```

### PR Title Format
```
fix: AI-generated fix for {error_type} in {repo_name}
```

### PR Body Format
```markdown
## AI-Generated Fix for {repo_name}

### Error
```
{error_message}
```

### AI Analysis and Recommendations
{ai_analysis[:2000]}

### Changes
- {file_list}
- Created AI_FIX_SUMMARY.md with detailed analysis
- Ready for review and testing

### Next Steps
1. Review the AI-generated analysis
2. Test the suggested fixes
3. Make manual adjustments if needed
4. Merge when ready

---
*Generated by AI Error Monitor*
```

---

## Authentication & Authorization

### Header (if required)
```
Authorization: Bearer {optional_token}
```

### API Token (if required)
Configure in Settings > API

---

## Rate Limiting

- No explicit rate limit (depends on backend configuration)
- AI API calls may have their own rate limits
- GitHub API calls may have their own rate limits

---

## Timeout

- Recommended client timeout: 120 seconds
- Default backend timeout: 60 seconds (varies by operation)

---

## Content Negotiation

### Request
```
Content-Type: application/json
```

### Response
```
Content-Type: application/json
```

---

## Examples

### cURL
```bash
curl -X POST http://localhost:8000/fixes/generate \
  -H "Content-Type: application/json" \
  -d '{
    "repo_name": "Clone_Demo_Repo",
    "error_message": "TypeError: Cannot read properties of undefined (reading map)",
    "prompt": "Add null checking before property access"
  }'
```

### Python Requests
```python
import requests
import json

url = "http://localhost:8000/fixes/generate"
payload = {
    "repo_name": "Clone_Demo_Repo",
    "error_message": "TypeError: Cannot read properties of undefined (reading 'map')",
    "prompt": "Add null checking before property access"
}

response = requests.post(url, json=payload, timeout=120)
result = response.json()

if result.get("success"):
    print(f"PR created: {result['pr_info']['pr_url']}")
else:
    print(f"Error: {result.get('detail')}")
```

### JavaScript/Fetch
```javascript
const generateFix = async () => {
  const response = await fetch('http://localhost:8000/fixes/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      repo_name: 'Clone_Demo_Repo',
      error_message: "TypeError: Cannot read properties of undefined (reading 'map')",
      prompt: 'Add null checking before property access'
    }),
    timeout: 120000
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log(`PR URL: ${result.pr_info.pr_url}`);
    console.log(`PR Number: ${result.pr_info.pr_number}`);
  } else {
    console.error(`Error: ${result.detail}`);
  }
};
```

### TypeScript
```typescript
interface GenerateFixRequest {
  repo_name: string;
  error_message: string;
  prompt: string;
}

interface PRInfo {
  pr_url: string;
  pr_number: number;
  branch_name: string;
  status: string;
}

interface GenerateFixResponse {
  success: boolean;
  repo_name: string;
  error_message: string;
  fix: string;
  pr_info: PRInfo;
  jira_info: Record<string, any>;
  files_modified: number;
  generated_at: string;
}

async function generateFix(
  repoName: string,
  errorMessage: string,
  prompt: string
): Promise<GenerateFixResponse> {
  const response = await fetch('http://localhost:8000/fixes/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      repo_name: repoName,
      error_message: errorMessage,
      prompt: prompt
    })
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json() as Promise<GenerateFixResponse>;
}
```

---

## Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Fix generated and PR created successfully |
| 400 | Bad Request | Missing or invalid parameters |
| 500 | Internal Server Error | Backend error (check logs) |
| 503 | Service Unavailable | Backend or dependencies unavailable |

---

## Related Documentation

- [AI Fix Generation Guide](./AI_FIX_GENERATION_README.md)
- [Implementation Details](./AI_FIX_IMPLEMENTATION.md)
- [Usage Examples](./ai_fix_examples.py)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

---

**API Version:** 1.0
**Last Updated:** April 23, 2024
**Status:** Production Ready
