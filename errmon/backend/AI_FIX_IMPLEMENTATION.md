## AI-Powered Error Fix Generation - Implementation Guide

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR DETECTION & SUBMISSION                 │
│  (Error message + Repository name + Custom prompt provided)     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              POST /fixes/generate API Endpoint                  │
│  Input: repo_name, error_message, prompt                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI ANALYSIS STAGE (AI Service)                │
│                                                                 │
│  1. Initialize Gemini AI Client                               │
│  2. Construct comprehensive prompt with:                       │
│     - Error context                                            │
│     - Repository information                                   │
│     - Custom instructions                                      │
│  3. Call AI for analysis and fix suggestions                   │
│  4. AI returns JSON with:                                      │
│     - Root Cause Analysis (RCA)                               │
│     - Detailed explanation                                     │
│     - Severity level                                           │
│     - Proposed code changes (file by file)                     │
│     - Testing notes                                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                GIT OPERATIONS STAGE                             │
│                                                                 │
│  1. Clone repository to temporary directory                    │
│  2. Configure git user (ai-fixer@errmon.local)                 │
│  3. Create branch: fix/ai-detected-error-YYMMDD-HHMM         │
│  4. Apply proposed code changes:                               │
│     - Parse AI response for file changes                       │
│     - Locate each file in repository                           │
│     - Apply old_code → new_code replacement                    │
│  5. Create AI_FIX_SUMMARY.md with analysis                     │
│  6. Stage and commit changes                                   │
│  7. Push branch to remote repository                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              GITHUB PR CREATION STAGE                           │
│                                                                 │
│  1. Get repository info (default branch, etc.)                 │
│  2. Create Pull Request via GitHub API:                        │
│     - Title: "fix: AI-generated fix for error in {repo}"      │
│     - Body: Comprehensive PR description with:                 │
│       * Error details                                          │
│       * AI analysis summary                                    │
│       * Proposed changes                                       │
│       * Testing instructions                                   │
│     - Head branch: fix/ai-detected-error-YYMMDD-HHMM         │
│     - Base branch: main                                        │
│  3. Return PR details to user                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUCCESS RESPONSE                             │
│                                                                 │
│  {                                                              │
│    "success": true,                                             │
│    "repo_name": "Clone_Demo_Repo",                             │
│    "pr_info": {                                                │
│      "pr_url": "https://github.com/org/repo/pull/123",         │
│      "pr_number": 123,                                         │
│      "branch_name": "fix/ai-detected-error-240423-1430"        │
│    },                                                           │
│    "files_modified": 1,                                        │
│    "generated_at": "2024-04-23T14:30:00Z"                      │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Component Breakdown

#### 1. API Endpoint (/fixes/generate)

**Location:** `routes/fixes.py` - `generate_fix()` function

**Responsibilities:**
- Validate request parameters
- Call `ai_service.generate_fix()`
- Handle errors and timeouts
- Return structured response

**Request/Response:**
```python
# Request
POST /fixes/generate
Content-Type: application/json
{
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties of undefined",
  "prompt": "Add null checking before property access"
}

# Response
HTTP 200 OK
{
  "success": true,
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: ...",
  "fix": "AI-generated fix response",
  "pr_info": {...},
  "files_modified": 1,
  "generated_at": "ISO-8601 timestamp"
}
```

#### 2. AI Service (ai_service.py)

**Main Function:** `async def generate_fix(repo_name, error_message, prompt)`

**Workflow:**

```python
async def generate_fix(repo_name, error_message, prompt):
    """
    Complete workflow:
    1. Validate GitHub/AI configuration
    2. Initialize AI client
    3. Create temp directory for clone
    4. Clone repository
    5. Create feature branch
    6. Generate AI fix
    7. Parse AI response
    8. Apply fixes to files
    9. Commit changes
    10. Push branch
    11. Create GitHub PR
    12. Cleanup
    13. Return success response
    """
```

**Key Functions:**

- `parse_ai_response(response)` - Extracts structured data from AI response
- `apply_fixes_to_repo(repo_path, ai_analysis)` - Applies code changes
- `create_github_pr_from_branch(...)` - Creates PR on GitHub

#### 3. GitHub API Client (github_api.py)

**Class:** `GitHubAPI(token, org)`

**Methods:**

```python
# Create new branch
await gh.create_branch(repo_name, branch_name, base_branch="main")

# Get repository information
await gh.get_repository_info(repo_name)

# Get default branch
default = await gh.get_default_branch(repo_name)

# Get latest commit SHA
sha = await gh.get_latest_commit_sha(repo_name, branch="main")

# Create pull request
pr = await gh.create_pull_request(
    repo_name="repo",
    title="fix: ...",
    body="PR description",
    head_branch="fix/branch",
    base_branch="main"
)

# Add comment to PR
await gh.add_pr_comment(repo_name, pr_number, comment)

# Get PR details
details = await gh.get_pr_details(repo_name, pr_number)

# Commit files via API (for small changes)
await gh.create_commit(
    repo_name="repo",
    branch="branch",
    message="commit message",
    changes={"file1.js": "content", "file2.js": "content"}
)
```

#### 4. AI Client (GeminiUtils.py)

**Class:** `GenAIClient(api_key)`

**Method:** `generate_fix(repo_name, error_message, prompt)`

**Returns:** JSON string with:
```json
{
  "rca": "Root cause analysis text",
  "explanation": "What the fix does",
  "severity": "high|medium|low",
  "proposed_changes": [
    {
      "file": "path/to/file.jsx",
      "description": "What changed",
      "old_code": "code before",
      "new_code": "code after"
    }
  ],
  "testing_notes": "How to test"
}
```

### Implementation Checklist

- [x] **ai_service.py**
  - [x] `generate_fix()` - Complete workflow
  - [x] `parse_ai_response()` - Parse and validate AI response
  - [x] `apply_fixes_to_repo()` - Apply code changes to files
  - [x] `create_github_pr_from_branch()` - Create PR on GitHub
  - [x] `create_github_pr()` - Alternative PR creation method
  - [x] `create_jira_ticket()` - JIRA integration (bonus)
  - [x] Git operations integration

- [x] **github_api.py**
  - [x] `GitHubAPI` class with token and org
  - [x] `get_repository_info()` - Get repo details
  - [x] `get_default_branch()` - Get default branch
  - [x] `get_latest_commit_sha()` - Get commit SHA
  - [x] `create_branch()` - Create feature branch
  - [x] `create_pull_request()` - Create PR
  - [x] `add_pr_comment()` - Add comment to PR
  - [x] `get_pr_details()` - Get PR info
  - [x] `create_commit()` - Create commit via API
  - [x] `update_branch_protection()` - Update protections

- [x] **GeminiUtils.py**
  - [x] Improved `generate_fix()` with error handling
  - [x] Structured JSON response handling

- [x] **routes/fixes.py**
  - [x] `/fixes/generate` endpoint
  - [x] Request validation
  - [x] Response formatting

- [x] **Documentation**
  - [x] AI_FIX_GENERATION_README.md - Complete guide
  - [x] AI_FIX_IMPLEMENTATION.md - This file
  - [x] ai_fix_examples.py - Usage examples

### Configuration Setup Guide

#### Step 1: GitHub Configuration

```python
# In Settings UI or Direct DB:
db.settings.update_one(
    {"key": "github"},
    {
        "$set": {
            "value": {
                "token": "ghp_YOUR_GITHUB_TOKEN",
                "org": "your-github-org",  # e.g., "vineetkumar2016"
                "gemini_api_key": "AIza_YOUR_GEMINI_KEY"
            }
        }
    },
    upsert=True
)
```

**Get GitHub Token:**
1. https://github.com/settings/tokens
2. "Generate new token (classic)"
3. Scopes: `repo`, `workflow`
4. Copy token immediately

#### Step 2: AI Configuration

```python
# In Settings UI or Direct DB:
db.settings.update_one(
    {"key": "ai"},
    {
        "$set": {
            "value": {
                "investigation_api_key": "AIza_YOUR_GEMINI_KEY",
                "investigation_model": "gemini-flash-latest",
                "investigation_provider": "google"
            }
        }
    },
    upsert=True
)
```

**Get Gemini API Key:**
1. https://aistudio.google.com/app/apikey
2. Create API key
3. Copy key

#### Step 3: Repository Configuration

Ensure `constants.py` has:
```python
GIT_HUB_REPO = "git@github.com:your-org/your-repo.git"
ORG_REPO = "your-org/your-repo"
GIT_USER_NAME = "your-org"  # For default org
```

### Error Handling & Edge Cases

#### Configuration Errors
```python
if not gh_token or not gh_org:
    return "Error: GitHub token or organization not configured"

if not api_key:
    return "Error: AI API key not configured"
```

#### Git Errors
```python
try:
    subprocess.run(["git", "clone", ...], check=True)
except subprocess.CalledProcessError as e:
    return f"Git error: {e.stderr.decode()}"
```

#### AI Response Parsing
```python
# Handle various response formats
if "```json" in response:
    # Extract JSON from markdown
elif "{" in response:
    # Try direct JSON parse
else:
    # Fallback to text response
```

#### File Application
```python
if not os.path.exists(full_path):
    logging.warning(f"File not found: {full_path}")
    continue

if old_code not in content:
    logging.warning(f"Old code not found in {file_path}")
    continue
```

### Testing the System

#### Test 1: Configuration Validation
```bash
# Check GitHub settings
curl -X GET http://localhost:8000/api/settings/github

# Check AI settings
curl -X GET http://localhost:8000/api/settings/ai
```

#### Test 2: Simple Fix Generation
```bash
curl -X POST http://localhost:8000/fixes/generate \
  -H "Content-Type: application/json" \
  -d '{
    "repo_name": "Clone_Demo_Repo",
    "error_message": "TypeError: Cannot read properties",
    "prompt": "Add null check"
  }'
```

#### Test 3: PR Verification
```bash
# After PR creation, verify on GitHub:
# https://github.com/your-org/repo/pulls
# Look for PR with "fix: AI-generated" prefix
```

#### Test 4: Code Review
```bash
# In the PR:
# 1. Review AI_FIX_SUMMARY.md
# 2. Review proposed changes
# 3. Run tests
# 4. Merge if approved
```

### Performance Optimization

1. **Parallel Operations**
   - Clone and AI analysis can run in parallel
   - Multiple file applications can be parallelized

2. **Caching**
   - Cache repository info (branch names, default branch)
   - Cache file existence checks

3. **Timeout Management**
   - Clone timeout: 30 seconds
   - API timeout: 15-30 seconds
   - Total timeout: Varies (60-120 seconds)

4. **Resource Cleanup**
   - Always cleanup temp directories in finally block
   - Close httpx clients properly
   - Remove old temp files periodically

### Logging & Monitoring

Key logging points:
```python
logging.info(f"Cloning repository: {repo_name}")
logging.info(f"Creating branch: {branch_name}")
logging.info(f"Applied fix to: {file_path}")
logging.info(f"PR created: {pr_data.get('html_url')}")
logging.error(f"Git command error: {e}")
logging.error(f"Error applying fix: {e}")
```

### Security Best Practices

1. **Token Storage**
   - Never log tokens
   - Store encrypted in database
   - Use environment variables for secrets

2. **Code Validation**
   - Validate file paths before writing
   - Prevent path traversal attacks
   - Limit file size for modifications

3. **API Safety**
   - Use timeouts on all API calls
   - Validate AI response format
   - Sanitize PR comments

4. **Repository Safety**
   - Clone to temporary directories only
   - Use isolated git users
   - Cleanup after operations

### Future Enhancements

1. **Multi-AI Support**
   - Support Claude, GPT-4, LLaMA
   - Provider abstraction layer

2. **Code Quality**
   - Integrate linting/formatting
   - Run tests before PR creation
   - Generate test cases from AI

3. **Workflow Automation**
   - Auto-merge trusted fixes
   - Auto-assign reviewers
   - Link to JIRA issues

4. **Analytics**
   - Track fix success rate
   - Monitor AI accuracy
   - Cost tracking

### Support & Troubleshooting

**Common Issues:**

1. **"GitHub token not configured"**
   - Solution: Add token in Settings > GitHub

2. **"AI API key not configured"**
   - Solution: Add Gemini key in Settings > AI Models

3. **"Cannot access repo"**
   - Check token permissions
   - Verify org/repo names
   - Test git clone manually

4. **"PR creation failed"**
   - Branch might exist
   - Check base branch exists
   - Verify PR doesn't already exist

---

**Implementation Status:** ✅ Complete & Ready for Testing

**Last Updated:** April 23, 2024
