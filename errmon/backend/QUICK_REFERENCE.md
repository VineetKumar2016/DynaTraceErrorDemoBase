# AI Error Fix Generation - Quick Reference Guide

## 🎯 One-Minute Overview

**What It Does:**
```
Error Message → AI Analysis → Code Fix → Git Branch → GitHub PR
```

**How to Use:**
```bash
POST /fixes/generate
{
  "repo_name": "Clone_Demo_Repo",
  "error_message": "TypeError: Cannot read properties...",
  "prompt": "Add null checking"
}
```

**What You Get:**
```
✅ AI analysis of the error
✅ Suggested code changes
✅ New feature branch
✅ Automatic GitHub PR
✅ Ready for review
```

---

## 📊 System Components

```
┌──────────────────────────────────────────────────────────────┐
│                    API Endpoint                              │
│              POST /fixes/generate                            │
└────────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
  ┌──────────┐    ┌──────────┐    ┌──────────────┐
  │ Validate │    │ Call AI  │    │ Git Ops      │
  │   Config │    │ Service  │    │              │
  └──────────┘    └──────────┘    └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
  ┌──────────────┐              ┌──────────────┐
  │ Create PR    │              │ Cleanup Temp │
  │ on GitHub    │              │ Directory    │
  └──────────────┘              └──────────────┘
        │
        ▼
  ┌──────────────────────────┐
  │ Return Success Response  │
  │ with PR Link             │
  └──────────────────────────┘
```

---

## 🔧 Configuration

### Step 1: GitHub Token
```
Settings → GitHub → token: ghp_xxxxxxxxxxxxx
```

### Step 2: Gemini API Key
```
Settings → AI Models → investigation_api_key: AIza_xxxxxxxxxxxxx
```

### Step 3: Repository URL
```python
# constants.py
GIT_HUB_REPO = "git@github.com:org/repo.git"
ORG_REPO = "org/repo"
GIT_USER_NAME = "org-name"
```

---

## 📝 AI Response Format

The AI returns JSON with complete analysis:

```json
{
  "rca": "Root cause analysis",
  "explanation": "How to fix it",
  "severity": "high|medium|low",
  "proposed_changes": [
    {
      "file": "src/components/Error.jsx",
      "description": "What changed",
      "old_code": "error.details.map(...)",
      "new_code": "error?.details?.map(...)"
    }
  ],
  "testing_notes": "How to test"
}
```

---

## 🔄 Request → Response

### Request
```json
POST /fixes/generate
{
  "repo_name": "MyRepo",
  "error_message": "TypeError: undefined",
  "prompt": "Add null checks"
}
```

### Response (Success)
```json
{
  "success": true,
  "pr_info": {
    "pr_url": "https://github.com/org/repo/pull/123",
    "pr_number": 123,
    "branch_name": "fix/ai-detected-error-240423-1430"
  },
  "files_modified": 1,
  "generated_at": "2024-04-23T14:30:00Z"
}
```

### Response (Error)
```json
{
  "detail": "Error: GitHub token not configured"
}
```

---

## 🔌 File Modifications

The AI suggests changes in this format:

```python
# OLD CODE → NEW CODE
error.details.map(item => item.name)
↓
error?.details?.map(item => item.name)
```

The system:
1. ✅ Reads the original file
2. ✅ Finds the old code
3. ✅ Replaces with new code
4. ✅ Saves the file
5. ✅ Commits the change

---

## 🌳 Git Operations

```
Current State:
  origin/main (main branch)

After AI Fix:
  origin/main (unchanged)
  └─ fix/ai-detected-error-240423-1430 (new branch with fix)
     └─ AI_FIX_SUMMARY.md (analysis file)
     └─ modified files (with fixes applied)
```

---

## 📤 PR Creation

The system creates a PR with:

**Title:**
```
fix: AI-generated fix for TypeError in MyRepo
```

**Body:**
```
## AI-Generated Fix for MyRepo

### Error
TypeError: Cannot read properties of undefined

### AI Analysis
Root cause: error.details not checked for null
Solution: Add optional chaining operator

### Changes
- src/components/Error.jsx: Added null checking
- AI_FIX_SUMMARY.md: Added detailed analysis

### Next Steps
1. Review changes
2. Run tests
3. Merge when approved
```

---

## ✅ Verification Checklist

After calling the API:

- [ ] Check response contains `"success": true`
- [ ] Note the PR number from response
- [ ] Go to GitHub and find the PR
- [ ] Review AI_FIX_SUMMARY.md
- [ ] Review proposed code changes
- [ ] Run tests
- [ ] Approve and merge (manually)

---

## 🐛 Troubleshooting

### "GitHub token not configured"
```
Solution: Add token in Settings > GitHub
```

### "AI API key not configured"
```
Solution: Add key in Settings > AI Models
```

### "Cannot access repo"
```
Solution: Verify org/repo names and token permissions
```

### "PR creation failed"
```
Solution: Check branch exists and base branch is correct
```

---

## 🚀 Usage by Role

### For Engineers
```bash
# Create a fix for an error
curl -X POST http://localhost:8000/fixes/generate \
  -H "Content-Type: application/json" \
  -d '{
    "repo_name": "Clone_Demo_Repo",
    "error_message": "TypeError: Cannot map undefined",
    "prompt": "Add null checks and type guards"
  }'
```

### For Managers
```
1. Navigate to Error Details page
2. Click "Generate AI Fix"
3. Review PR that was created
4. Monitor fix effectiveness
```

### For QA
```
1. Check AI_FIX_SUMMARY.md in PR
2. Review proposed changes
3. Run test cases from testing_notes
4. Verify fix works as expected
```

---

## 📊 What Gets Modified

### Repository is Modified
```
src/components/Error.jsx     (code changes applied)
AI_FIX_SUMMARY.md           (new file with analysis)
```

### GitHub is Modified
```
New branch: fix/ai-detected-error-240423-1430
New PR #123: AI-generated fix for TypeError
```

### Database is NOT Modified
```
Errors collection unchanged
Fixes collection unchanged
Settings collection unchanged
```

---

## 🔐 Security Notes

✅ **Safe:**
- Code changes are reviewed before merge
- No automatic merging
- Full audit trail in git
- No credentials in logs

⚠️ **Important:**
- Keep GitHub token secret
- Don't share API keys
- Review AI code before merging
- Monitor PR activity

---

## 📈 Monitoring

### What to Monitor
```
✓ Number of fixes generated
✓ Success rate of fixes
✓ Time to generate fix
✓ AI analysis accuracy
✓ PR review time
✓ Merge rate
```

### Key Logs
```
INFO: Cloning repository
INFO: Creating branch
INFO: Applied fix to: src/components/Error.jsx
INFO: PR created: https://github.com/.../pull/123
ERROR: (any errors in the process)
```

---

## 🎓 Learning Resources

1. **API_CONTRACT.md** - Full API specification
2. **AI_FIX_GENERATION_README.md** - User guide
3. **AI_FIX_IMPLEMENTATION.md** - Technical details
4. **ai_fix_examples.py** - Runnable examples
5. **IMPLEMENTATION_SUMMARY.md** - Overview

---

## 💡 Tips & Tricks

### Best Prompts
```
✅ "Add null checking before array access"
✅ "Fix the missing type definition"
✅ "Add error handling to the async function"

❌ Fix my code
❌ It's broken
```

### For Complex Errors
```
Include in error_message:
- Full error message
- Stack trace
- Relevant code snippet
- Steps to reproduce
```

### For Better Results
```
Include in prompt:
- Language/framework context
- Coding standards
- Testing requirements
- Any constraints
```

---

## 📞 Quick Support

**Configuration Issues?**
→ Check Settings > GitHub and Settings > AI Models

**API Not Working?**
→ Check logs in backend terminal

**PR Not Creating?**
→ Verify org/repo names in constants.py

**Need Examples?**
→ See ai_fix_examples.py

---

## 🎯 Common Workflows

### Workflow 1: Simple Bug Fix
```
1. Error detected: TypeError
2. Click "Generate AI Fix"
3. Review PR
4. Merge
5. Done ✅
```

### Workflow 2: Complex Error
```
1. Error detected: Complex issue
2. Provide detailed prompt
3. AI analyzes with context
4. Review multiple file changes
5. Test changes
6. Merge when confident
```

### Workflow 3: Production Emergency
```
1. Error identified critical
2. Generate fix immediately
3. Request urgent review
4. Expedited testing
5. Quick merge
6. Monitor closely
```

---

## 📋 Reference

| Component | Purpose |
|-----------|---------|
| AI Service | Orchestrates entire workflow |
| GitHub API | Manages repos and PRs |
| Gemini AI | Analyzes errors and suggests fixes |
| Git Operations | Creates branches and commits |
| API Endpoint | Accepts user requests |

---

## ✨ Features At A Glance

- ✅ Error analysis by AI
- ✅ Automatic code fixes
- ✅ Git integration
- ✅ PR automation
- ✅ Full error handling
- ✅ Comprehensive docs
- ✅ Ready for production

---

**Last Updated:** April 23, 2024
**Status:** ✅ Ready to Use
