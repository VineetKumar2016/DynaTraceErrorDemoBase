# AI-Powered Error Fix Generation System

A comprehensive system for automatically analyzing errors and generating fixes using AI, creating branches, and opening Pull Requests on GitHub.

## Overview

This system enables the complete workflow:

1. **Error Detection** → Error message and context captured
2. **AI Analysis** → Gemini AI analyzes the error and generates fixes
3. **Fix Application** → Proposed changes are applied to repository files
4. **Branch Creation** → Code changes committed to a new feature branch
5. **PR Creation** → Pull Request automatically created on GitHub

## Quick Start

### API Endpoint

```bash
POST /fixes/generate

Request Body:
{
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties of undefined (reading 'map')",
  "prompt": "Add null check before accessing the property"
}

Response:
{
  "success": true,
  "repo_name": "Clone_Demo_Repo",
  "pr_info": {
    "pr_url": "https://github.com/org/repo/pull/123",
    "pr_number": 123,
    "branch_name": "fix/ai-detected-error-240423-1430"
  },
  "files_modified": ["src/ErrorDetail.jsx"],
  "generated_at": "2024-04-23T14:30:00Z"
}
```

## Architecture

### Key Components

#### 1. **ai_service.py**
Main service for error analysis and fix generation
- `generate_fix()` - Orchestrates the complete workflow
- `parse_ai_response()` - Parses AI output into structured data
- `apply_fixes_to_repo()` - Applies code changes to files
- `create_github_pr_from_branch()` - Creates PR on GitHub

#### 2. **github_api.py** 
GitHub API client for repository operations
```python
gh = GitHubAPI(token, org)

# Create branch
await gh.create_branch(repo_name, branch_name, base_branch="main")

# Create PR
await gh.create_pull_request(repo_name, title, body, head_branch, base_branch)

# Add comment to PR
await gh.add_pr_comment(repo_name, pr_number, comment_text)

# Get PR details
await gh.get_pr_details(repo_name, pr_number)
```

#### 3. **GeminiUtils.py**
AI inference client
```python
client = GenAIClient(api_key)
response = client.generate_fix(repo_name, error_message, prompt)
```

#### 4. **routes/fixes.py**
REST API endpoint for fix generation
```python
@router.post("/generate")
async def generate_fix(request: GenerateFixRequest):
    # Handles /fixes/generate endpoint
```

## Configuration

### Required Settings

#### GitHub Configuration
Store in database at `db.settings` with key `"github"`:
```json
{
  "token": "ghp_YOUR_TOKEN_HERE",
  "org": "your-github-org",
  "gemini_api_key": "AIza_YOUR_KEY_HERE"
}
```

#### AI Configuration
Store in database at `db.settings` with key `"ai"`:
```json
{
  "investigation_api_key": "AIza_YOUR_GEMINI_KEY",
  "investigation_model": "gemini-flash-latest",
  "investigation_provider": "google"
}
```

### Generating Tokens

**GitHub Personal Access Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`
4. Copy and store securely

**Google Gemini API Key:**
1. Go to https://aistudio.google.com/app/apikey
2. Create new API key
3. Copy and store in settings

## How It Works

### Step 1: Error Analysis
```python
# User submits error details
error_message = "Cannot read properties of undefined (reading 'map')"
prompt = "The error occurs in ErrorDetail.jsx at line 45"

# AI analyzes the error
response = client.generate_fix(repo_name, error_message, prompt)
```

### Step 2: AI Response Processing
The AI returns a JSON response:
```json
{
  "rca": "The error.details property is not being checked for null before use",
  "explanation": "Add an optional chaining operator or null check",
  "severity": "high",
  "proposed_changes": [
    {
      "file": "src/pages/ErrorDetail.jsx",
      "description": "Add null check before mapping",
      "old_code": "error.details.map(item => {...})",
      "new_code": "error?.details?.map(item => {...})"
    }
  ],
  "testing_notes": "Test with missing details property"
}
```

### Step 3: Repository Operations
```bash
1. Clone repository to temporary directory
2. Create new branch: fix/ai-detected-error-YYMMDD-HHMM
3. Apply proposed changes to files
4. Create commit with message: "fix: AI-generated fix for..."
5. Push branch to remote
```

### Step 4: PR Creation
```python
# Create PR on GitHub
pr_result = await gh.create_pull_request(
    repo_name="Clone_Demo_Repo",
    title="fix: AI-generated fix for undefined reference",
    body="[AI-generated PR with analysis and changes]",
    head_branch="fix/ai-detected-error-240423-1430",
    base_branch="main"
)
```

### Step 5: Output
```
✓ Fix branch created successfully!

Branch Name: fix/ai-detected-error-240423-1430
Repository: https://github.com/org/repo/tree/fix/ai-detected-error-240423-1430

PR Status: Created
PR URL: https://github.com/org/repo/pull/123
PR Number: 123

Files Modified: 1
  - src/pages/ErrorDetail.jsx

AI Analysis Summary:
RCA: The error.details property is not being checked for null before use...
Severity: high
```

## File Structure

```
backend/
├── ai_service.py              # Main AI service
├── github_api.py              # GitHub API client
├── ai_fix_examples.py         # Usage examples
├── routes/
│   ├── fixes.py              # /fixes/generate endpoint
│   └── ...
├── frontend/src/Utilities/
│   └── GeminiUtils.py        # Gemini AI client
└── requirements.txt          # Dependencies
```

## API Reference

### POST /fixes/generate

Generate a fix for an error and create a PR.

**Request:**
```json
{
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties of undefined (reading 'map')",
  "prompt": "Please add null checking and type guards"
}
```

**Response:**
```json
{
  "success": true,
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties of undefined (reading 'map')",
  "fix": "AI-generated analysis...",
  "pr_info": {
    "pr_url": "https://github.com/org/repo/pull/123",
    "pr_number": 123,
    "branch_name": "fix/ai-detected-error-240423-1430",
    "status": "created"
  },
  "jira_info": {},
  "files_modified": 1,
  "generated_at": "2024-04-23T14:30:00Z"
}
```

**Error Response:**
```json
{
  "detail": "Error message describing what went wrong"
}
```

## Advanced Usage

### Using GitHub API Directly

```python
from github_api import GitHubAPI

gh = GitHubAPI(token="ghp_xxx", org="your-org")

# Create a branch
result = await gh.create_branch("repo-name", "fix/issue-001")

# Create a PR
pr = await gh.create_pull_request(
    repo_name="repo-name",
    title="fix: My AI-generated fix",
    body="This PR fixes...",
    head_branch="fix/issue-001",
    base_branch="main"
)

# Add comments
await gh.add_pr_comment("repo-name", pr["pr_number"], "LGTM!")

# Get PR details
details = await gh.get_pr_details("repo-name", 123)
```

### Customizing AI Prompts

The system uses Gemini AI. You can customize prompts:

```python
custom_prompt = """
You are an expert {language} developer.
Analyze this error and provide:
1. Root cause
2. Specific code changes
3. Test cases

Error: {error_message}
"""

result = await generate_fix(repo_name, error_message, custom_prompt)
```

### Handling Different Languages

The system can work with any code language. Configure prompts accordingly:

```python
# For Python
python_prompt = "You are a Python expert..."

# For React/TypeScript
react_prompt = "You are a React/TypeScript expert..."

# For Java
java_prompt = "You are a Java expert..."
```

## Error Handling

The system includes robust error handling:

- **Configuration Missing**: Returns clear error messages
- **AI API Failures**: Gracefully degrades with fallback responses
- **Git Operations**: Proper error codes and messages
- **GitHub API Errors**: Detailed API response capture
- **File Operations**: Safe handling of missing/unreadable files

## Monitoring & Logging

All operations are logged:
- AI analysis requests and responses
- Git operations (clone, branch, commit, push)
- GitHub API calls and responses
- File modifications
- Errors and exceptions

Access logs via:
```python
import logging
logging.getLogger().setLevel(logging.INFO)
```

## Security Considerations

1. **Tokens**: Store GitHub and AI tokens in environment variables, not in code
2. **API Keys**: Use secure database encryption for stored credentials
3. **Git Authentication**: Use SSH keys or tokens with limited scope
4. **Code Review**: All generated PRs should be reviewed before merging
5. **Logging**: Be careful not to log sensitive information

## Troubleshooting

### Issue: "GitHub token not configured"
**Solution**: Go to Settings > GitHub and add your tokens

### Issue: "AI API key not configured"
**Solution**: Go to Settings > AI Models and add your Gemini API key

### Issue: "Cannot access repo"
**Solution**: Verify GitHub token has repo access and org/repo name is correct

### Issue: "PR creation failed"
**Solution**: Check that the branch exists and base branch is correct

## Future Enhancements

- [ ] Support for multiple AI providers (Claude, GPT-4, etc.)
- [ ] Unit test generation from AI fixes
- [ ] Automated PR review and approval workflows
- [ ] Integration with CI/CD pipelines
- [ ] Collaborative fix refinement
- [ ] Performance metrics and optimization
- [ ] Multi-language support improvements

## Contributing

To extend the system:

1. **Add new AI providers**: Extend `ai_service.py`
2. **Add GitHub features**: Extend `GitHubAPI` class
3. **Improve fix detection**: Enhance `parse_ai_response()`
4. **Better file matching**: Improve `apply_fixes_to_repo()`

## Support

For issues or questions:
1. Check the logs
2. Review the examples in `ai_fix_examples.py`
3. Verify configuration in Settings
4. Check GitHub/AI API status

## License

See LICENSE file for details.
