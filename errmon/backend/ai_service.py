"""
AI Analysis Service - Calls real Anthropic Claude API to analyze errors and generate fixes
"""
import httpx
import json
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, AsyncGenerator
from database import db
import constants
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(filename)s:%(lineno)d | %(message)s"
)

logger = logging.getLogger(__name__)


async def get_ai_config():
    logger.info(f"get_ai_config :: Fetching AI config from database")
    doc = await db.settings.find_one({"key": "ai"})
    return doc.get("value", {}) if doc else {}

async def get_github_config():
    logger.info(f"get_github_config :: Fetching GitHub config from database")
    doc = await db.settings.find_one({"key": "github"})
    return doc.get("value", {}) if doc else {}

async def get_error_by_id(error_id: str) -> Optional[Dict]:
    logger.info(f"get_error_by_id :: Fetching error by ID: {error_id}")
    return await db.errors.find_one({"_id": error_id})

async def analyze_error_stream(error_id: str) -> AsyncGenerator[str, None]:
    """Stream AI analysis of an error, yielding SSE-formatted events"""
    logger.info(f"analyze_error_stream :: error_id: {error_id}")

    ai_config = await get_ai_config()
    provider  = ai_config.get("investigation_provider", "anthropic")
    model     = ai_config.get("investigation_model", "claude-sonnet-4-6")
    api_key   = ai_config.get("investigation_api_key", "")
    
    error = await get_error_by_id(error_id)
    if not error:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Error not found'})}\n\n"
        return
    
    # Update error status
    await db.errors.update_one({"_id": error_id}, {"$set": {"status": "analyzing"}})
    
    # Create fix record
    fix_doc = {
        "error_id": error_id,
        "status": "investigating",
        "severity": "medium",
        "model": model,
        "tokens_in": 0,
        "tokens_out": 0,
        "cost_usd": 0.0,
        "tool_calls": 0,
        "rca": "",
        "explanation": "",
        "proposed_changes": [],
        "testing_notes": "",
        "timeline": [],
        "pr_status": "pending",
        "jira_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    fix_result = await db.fixes.insert_one(fix_doc)
    fix_id = str(fix_result.inserted_id)
    
    yield f"data: {json.dumps({'type': 'fix_created', 'fix_id': fix_id})}\n\n"
    
    # Gather context
    gh_config = await get_github_config()
    token = gh_config.get("token", "")
    gemini_api_key = ai_config.get("gemini_api_key", "")
    
    # Get raw logs
    raw_logs = error.get("raw_logs", [])
    log_text = json.dumps(raw_logs[:5], indent=2) if raw_logs else error.get("message", "")
    
    # Get source files if GitHub configured
    source_files = {}
    repo = error.get("repo", "")
    org = gh_config.get("org", "")
    if token and repo and org:
        yield f"data: {json.dumps({'type': 'timeline', 'step': {'label': 'Tool Call', 'badge': 'fetch_repo', 'content': f'Fetching source files from {org}/{repo}', 'time': datetime.now(timezone.utc).strftime('%H:%M:%S')}})}\n\n"
        source_files = await get_repo_files(f"{org}/{repo}", token, error.get("message", ""))
        if source_files:
            yield f"data: {json.dumps({'type': 'timeline', 'step': {'label': 'Result', 'badge': None, 'content': f'Found {len(source_files)} relevant files: {list(source_files.keys())}', 'time': datetime.now(timezone.utc).strftime('%H:%M:%S')}})}\n\n"
    
    # Build prompt
    files_context = ""
    for path, content in source_files.items():
        files_context += f"\n### {path}\n```\n{content}\n```\n"
    
    system_prompt = """You are an expert software engineer performing root cause analysis on production errors.
Analyze the error thoroughly and provide:
1. A clear root cause analysis (rca)
2. A detailed explanation of the fix
3. Specific code changes (if source is available)
4. Testing instructions
5. Severity assessment (low/medium/high/critical)

Respond ONLY with valid JSON in this exact structure:
{
  "rca": "Root cause analysis text",
  "explanation": "Fix explanation text", 
  "severity": "medium",
  "proposed_changes": [
    {
      "file": "path/to/file.cs",
      "description": "What change to make",
      "diff": "unified diff or code snippet"
    }
  ],
  "testing_notes": "How to test this fix",
  "confidence": "high"
}"""

    user_prompt = f"""Analyze this production error:

**Error Type:** {error.get('error_type', 'Unknown')}
**Service:** {error.get('service', 'unknown')}
**Repository:** {repo}
**Occurrences:** {error.get('occurrences', 1)}
**Classification:** {error.get('classification', 'unknown')}

**Error Message:**
{error.get('message', '')}

**Raw Logs (sample):**
```json
{log_text[:2000]}
```
{files_context[:4000] if files_context else "No source files available - provide analysis based on error message."}

Provide a thorough root cause analysis and fix."""

    yield f"data: {json.dumps({'type': 'timeline', 'step': {'label': 'Tool Call', 'badge': 'analyze', 'content': f'Sending to {model} for analysis...', 'time': datetime.now(timezone.utc).strftime('%H:%M:%S')}})}\n\n"
    
    analysis_result = None

    if api_key and provider in ("anthropic", "openai", "google"):
        try:
            analysis_result = await call_ai(provider, model, api_key, system_prompt, user_prompt)
            analysis_result["tool_calls"] = len(source_files) + 1
            t_in  = analysis_result.get("tokens_in", 0)
            t_out = analysis_result.get("tokens_out", 0)
            cost  = analysis_result.get("cost_usd", 0)
            summary = f"Analysis complete ({provider}/{model}). {t_in} in / {t_out} out. Cost: ${cost:.4f}"
            yield f"data: {json.dumps({'type': 'timeline', 'step': {'label': 'Result', 'badge': None, 'content': summary, 'time': datetime.now(timezone.utc).strftime('%H:%M:%S')}})}\n\n"
        except Exception as e:
            err_msg = str(e)
            yield f"data: {json.dumps({'type': 'timeline', 'step': {'label': 'Error', 'badge': 'api_error', 'content': err_msg, 'time': datetime.now(timezone.utc).strftime('%H:%M:%S')}})}\n\n"
    else:
        yield f"data: {json.dumps({'type': 'timeline', 'step': {'label': 'Warning', 'badge': 'no_api_key', 'content': 'No AI API key configured. Configure in Settings > AI Models.', 'time': datetime.now(timezone.utc).strftime('%H:%M:%S')}})}\n\n"
        analysis_result = {
            "rca": f"Error type '{error.get('error_type')}' in service '{error.get('service')}'. Configure an AI API key in Settings > AI Models.",
            "explanation": "Add an investigation API key in Settings > AI Models to enable AI-powered analysis.",
            "severity": "medium", "proposed_changes": [],
            "testing_notes": "Manual investigation required.", "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0, "tool_calls": 0
        }
    
    # Save analysis results
    if analysis_result:
        update = {
            "status": "completed",
            "rca": analysis_result.get("rca", ""),
            "explanation": analysis_result.get("explanation", ""),
            "severity": analysis_result.get("severity", "medium"),
            "proposed_changes": analysis_result.get("proposed_changes", []),
            "testing_notes": analysis_result.get("testing_notes", ""),
            "tokens_in": analysis_result.get("tokens_in", 0),
            "tokens_out": analysis_result.get("tokens_out", 0),
            "cost_usd": analysis_result.get("cost_usd", 0.0),
            "tool_calls": analysis_result.get("tool_calls", 0),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.fixes.update_one({"_id": fix_id}, {"$set": update})
        await db.errors.update_one({"_id": error_id}, {"$set": {"status": "fix_generated"}})
        
        yield f"data: {json.dumps({'type': 'complete', 'fix_id': fix_id, 'analysis': update})}\n\n"
    else:
        await db.fixes.update_one({"_id": fix_id}, {"$set": {"status": "completed", "rca": "Analysis failed", "updated_at": datetime.now(timezone.utc).isoformat()}})
        await db.errors.update_one({"_id": error_id}, {"$set": {"status": "new"}})
        yield f"data: {json.dumps({'type': 'error', 'message': 'Analysis failed'})}\n\n"

async def generate_fix(repo_name: str, error_message: str, prompt: str) -> str:
    """Generate a fix using AI and create a branch with the fix in the repository.
    """
    logger.info(f"generate_fix :: repo_name: {repo_name}, error_message: {error_message[:100]}..., ")
    try:
        import sys
        import os
        import subprocess
        import tempfile
        import shutil
        import logging
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'Utilities'))
        
        # Get GitHub config from settings
        gh_config = await get_github_config()
        gh_token = gh_config.get("token", "")
        gh_org = gh_config.get("org", "")
        gh_org = gh_org or constants.GIT_USER_NAME  # Default org if not set

        if not gh_token or not gh_org:
            return f"Error: GitHub token or organization not configured. Please configure GitHub settings first."
        
        from GeminiUtils import GenAIClient
        
        # Get AI config from settings
        ai_config = await get_ai_config()
        api_key = ai_config.get("investigation_api_key", "")
        
        if not api_key:
            return f"Error: AI API key not configured. Please configure AI settings first."
        
        # Step 1: Initialize AI client
        client = GenAIClient(api_key=api_key)
        logger.info(f"generate_fix :: Creating fix branch for {repo_name}")
        
        # Create temporary directory for cloning
        temp_dir = tempfile.mkdtemp(prefix="fix_")
        try:
            repo_url = constants.GIT_HUB_REPO
            repo_path = os.path.join(temp_dir, repo_name)
            logger.info(f"generate_fix :: Cloning repository :: temp_dir : {temp_dir}")
            logger.info(f"generate_fix :: Cloning repository :: repo_url : {repo_url}")
            logger.info(f"generate_fix :: Cloning repository :: repo_path {repo_path}")
            logger.info(f"generate_fix :: Cloning repository :: repo_name {repo_name}")

            subprocess.run(
                ["git", "clone", repo_url, repo_path],
                check=True,
                capture_output=True,
                timeout=30
            )
            
            # Configure git user for commits
            subprocess.run(
                ["git", "config", "user.email", "ai-fixer@errmon.local"],
                cwd=repo_path,
                check=True,
                capture_output=True
            )
            subprocess.run(
                ["git", "config", "user.name", "AI Error Fixer"],
                cwd=repo_path,
                check=True,
                capture_output=True
            )
            
            # Fetch latest from main branch
            subprocess.run(
                ["git", "fetch", "origin", "main"],
                cwd=repo_path,
                check=True,
                capture_output=True,
                timeout=30
            )
            
            # Create new branch from main
            timestamp = datetime.now().strftime("%y%m%d-%H%M")
            branch_name = f"ai-detected-error-{timestamp}"
            logging.info(f"Creating branch: {branch_name}")
            subprocess.run(
                ["git", "checkout", "-b", branch_name, "origin/main"],
                cwd=repo_path,
                check=True,
                capture_output=True
            )

            # Step 2: Generate AI fix response
            org_repo = constants.ORG_REPO
            enhanced_prompt = f"""
You are an expert React/JavaScript engineer.
Analyze and fix the error in the branch {org_repo + "/" + branch_name}.
Repository: {org_repo + "/" + branch_name}
Branch Name: {branch_name}

Error:
{error_message}

Constraints:
- Maintain existing functionality
- Do not remove unrelated code
- Ensure code compiles successfully

Return 
    ONLY the complete updated file.
"""
            logger.info(f"generate_fix :: Generating fix with AI for enhanced_prompt {enhanced_prompt} on branch {branch_name}")
            # fix_response = ""
            fix_response = client.generate_fix(
                repo_name=repo_name + "/" + branch_name,
                error_message=error_message,
                prompt=enhanced_prompt
            )

            logger.info(f"generate_fix :: AI fix response received\n{fix_response}")
            
            # Step 3: Parse AI response and apply fixes
            ai_analysis = parse_ai_response(fix_response)
            logger.info(f"generate_fix :: AI fix Analysis received\n{ai_analysis}")
            
            files_modified = await apply_fixes_to_repo(repo_path + "/" + branch_name, ai_analysis)
            logger.info(f"generate_fix :: AI fix files_modified\n{files_modified}")
            
            # Step 4: Create fix summary file
            fix_file_path = os.path.join(repo_path, "AI_FIX_SUMMARY.md")
            fix_summary = f"""# AI-Generated Fix Summary

## Error Analysis
{ai_analysis.get('rca', 'No RCA available')}

## Explanation
{ai_analysis.get('explanation', 'No explanation available')}

## Files Modified
{json.dumps(files_modified, indent=2)}

# Testing Notes
{ai_analysis.get('testing_notes', 'Manual testing required')}

## Repository
{repo_name}

## Raw AI Response
{fix_response}
"""
            with open(fix_file_path, 'w') as f:
                f.write(fix_summary)
            
            logger.info(f"generate_fix :: Created fix summary file")
            
            # Stage and commit changes
            subprocess.run(
                ["git", "add", "."],
                cwd=repo_path,
                check=True,
                capture_output=True
            )
            
            commit_message = f"fix: AI-generated fix for {error_message[:80]}"
            logging.info(f"Committing changes with message: {commit_message}")
            subprocess.run(
                ["git", "commit", "-m", commit_message],
                cwd=repo_path,
                check=True,
                capture_output=True
            )
            
            # Push the branch
            logging.info(f"Pushing branch {branch_name} to origin")
            subprocess.run(
                ["git", "push", "-u", "origin", branch_name],
                cwd=repo_path,
                check=True,
                capture_output=True,
                timeout=30
            )
            
            # Step 5: Create PR using GitHub API
            pr_result = await create_github_pr_from_branch(
                gh_token=gh_token,
                org=gh_org,
                repo_name=repo_name,
                branch_name=branch_name,
                error_message=error_message,
                ai_analysis=fix_response
            )
            
            success_msg = f"""✓ Fix branch created successfully!

Branch Name: {branch_name}
Repository: https://github.com/{gh_org}/{repo_name}/tree/{branch_name}

PR Status: {pr_result.get('status', 'Created')}
PR URL: {pr_result.get('pr_url', 'N/A')}
PR Number: {pr_result.get('pr_number', 'N/A')}

Files Modified: {len(files_modified)}
{', '.join(files_modified) if files_modified else 'No files modified (summary only)'}

AI Analysis Summary:
RCA: {ai_analysis.get('rca', '')[:300]}...
Severity: {ai_analysis.get('severity', 'unknown')}
"""
            return success_msg
            
        except subprocess.CalledProcessError as e:
            logging.error(f"Git command error: {e}")
            return f"Error executing git command: {e.stderr.decode() if e.stderr else str(e)}"
        except Exception as e:
            logging.error(f"Error in generate fix: {e}")
            return f"Error generating fix: {str(e)}"
        finally:
            # Cleanup temporary directory
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
    
    except Exception as e:
        import logging
        logging.error(f"Error generating fix: {e}")
        return f"Error generating fix: {str(e)}"

async def create_github_pr_from_branch(gh_token: str, org: str, repo_name: str, 
                                       branch_name: str, error_message: str, ai_analysis: str) -> dict:
    """Create a GitHub PR from the fix branch.
    
    Args:
        gh_token: GitHub personal access token
        org: GitHub organization
        repo_name: Repository name
        branch_name: Branch name containing the fix
        error_message: Original error message
        ai_analysis: AI-generated analysis
        
    Returns:
        Dictionary with PR details
    """

    # print(f"Creating PR for {org}/{repo_name} from branch {branch_name}...")
    try:
        headers = {
            "Authorization": f"Bearer {gh_token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }

        repo_url = constants.GIT_HUB_REPO
        org = repo_url.split(":")[1].split("/")[0]

        # org = parse_github_url(repo_url).get("user", org)
        logger.info(f"create_github_pr_from_branch :: Parsed org: {org} from repo URL: {repo_url}")
    
        repo_full = f"{org}/{repo_name}"
        # repo_full = "git@github.com:VineetKumar2016/Clone_Demo_Repo.git"
        
        pr_title = f"fix: AI-generated fix for error in {repo_name}"
        pr_body = f"""## AI-Generated Fix for {repo_name}

### Error
```
{error_message}
```

### AI Analysis and Recommendations
{ai_analysis[:2000]}

### Changes
- Created AI_FIX_SUMMARY.md with detailed analysis
- Ready for review and testing

### Next Steps
1. Review the AI-generated analysis
2. Test the suggested fixes
3. Make manual adjustments if needed
4. Merge when ready

---
*Generated by AI Error Monitor*
"""
    # print(f"Creating PR with title: {pr_title}")
    # print(f"Repo FULL: {repo_full}") 
    # print(f"Branch: {branch_name}")
    # # print(f"PR Body: {pr_body[:500]}...") 
    # print("title length:", len(pr_title), pr_title)
    
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"https://api.github.com/repos/{repo_full}/pulls",
                headers=headers,
                json={
                    "title": pr_title,
                    "body": pr_body,
                    "head": branch_name,
                    "base": "main"
                }
            )
            
            if r.status_code in (201, 422):  # 422 = PR already exists
                try:
                    pr_data = r.json()
                    if r.status_code == 201:
                        import logging
                        logging.info(f"PR created: {pr_data.get('html_url')}")
                        return {
                            "status": "Created",
                            "pr_number": pr_data.get("number"),
                            "pr_url": pr_data.get("html_url")
                        }
                    else:
                        # PR might already exist
                        return {
                            "status": "Exists",
                            "pr_url": "Check GitHub for existing PR"
                        }
                except:
                    return {"status": "Unknown", "error": r.text[:200]}
            else:
                import logging
                logging.error(f"PR creation failed: {r.status_code} {r.text[:300]}")
                return {
                    "status": "Failed",
                    "error": f"GitHub API error {r.status_code}"
                }
    except Exception as e:
        import logging
        logging.error(f"Error creating PR: {e}")
        return {"status": "Error", "error": str(e)}


def parse_ai_response(response: str) -> Dict[str, Any]:
    """Parse AI-generated response and extract structured data.
    
    Args:
        response: AI response (JSON or text)
        
    Returns:
        Dictionary with parsed AI analysis
    """
    logger.info(f"parse_ai_response :: response: {response}")
    try:
        # Try to extract JSON from response
        if "```json" in response:
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
        
        if "```" in response:
            json_match = re.search(r'```\s*([\s\S]*?)\s*```', response)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
        
        # Try direct JSON parse
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass
        
        # Fallback: return text as RCA
        return {
            "rca": response[:500] if len(response) > 500 else response,
            "explanation": response[500:1000] if len(response) > 500 else "See RCA",
            "severity": "medium",
            "proposed_changes": [],
            "testing_notes": "Manual review required"
        }
    except Exception as e:
        import logging
        logging.error(f"Error parsing AI response: {e}")
        return {
            "rca": "Failed to parse AI response",
            "explanation": str(e),
            "severity": "high",
            "proposed_changes": [],
            "testing_notes": "Manual fix required"
        }


async def apply_fixes_to_repo(repo_path: str, ai_analysis: Dict[str, Any]) -> list:
    """Apply proposed fixes from AI analysis to repository files.
    
    Args:
        repo_path: Path to the cloned repository
        ai_analysis: Dictionary containing proposed changes
        
    Returns:
        List of modified files
    """
    import logging
    import os
    modified_files = []
    logger.info(f"apply_fixes_to_repo :: repo_path: {repo_path}, ai_analysis: {ai_analysis}")

    proposed_changes = ai_analysis.get("proposed_changes", [])
    
    for change in proposed_changes:
        try:
            file_path = change.get("file")
            old_code = change.get("old_code", "")
            new_code = change.get("new_code", "")
            
            if not file_path or not old_code or not new_code:
                logging.warning(f"Skipping incomplete change: {file_path}")
                continue
            
            full_path = os.path.join(repo_path, file_path)
            logger.info(f"apply_fixes_to_repo :: Applying fix to file: {full_path}")
            
            # Check if file exists
            if not os.path.exists(full_path):
                logging.warning(f"File not found: {full_path}")
                continue
            
            # Read file
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Apply fix
            if old_code in content:
                updated_content = content.replace(old_code, new_code, 1)
                
                # Write back
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(updated_content)
                
                modified_files.append(file_path)
                logging.info(f"Applied fix to: {file_path}")
            else:
                logging.warning(f"Old code not found in {file_path}")
                
        except Exception as e:
            logging.error(f"Error applying fix to {change.get('file')}: {e}")
    
    return modified_files


# def parse_github_url(url: str) -> dict:
#     """Parse GitHub repo URL and return components.
    
#     Supports:
#     - git@github.com:user/repo.git
#     - https://github.com/user/repo.git
#     - https://github.com/user/repo
    
#     Args:
#         url: GitHub repository URL
        
#     Returns:
#         Dictionary with protocol, user, repo, and full_name
#     """
#     result = {
#         "protocol": None,
#         "user": None,
#         "repo": None,
#         "full_name": None
#     }

#     # Detect protocol
#     if url.startswith("git@"):
#         result["protocol"] = "ssh"
#     elif url.startswith("http"):
#         result["protocol"] = "https"

#     # Regex to extract user and repo
#     match = re.search(r'github\.com[:/](.*?)/(.*?)(\.git)?$', url)

#     if match:
#         user = match.group(1)
#         repo = match.group(2)

#         result["user"] = user
#         result["repo"] = repo
#         result["full_name"] = f"{user}/{repo}"

#     return result

# async def get_repo_files(repo_full_name: str, token: str, error_context: str) -> Dict[str, str]:
    # """Fetch relevant source files from GitHub based on error context"""
    # headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    # files = {}
    
    # # Extract class/file hints from error
    # class_match = re.findall(r'(\w+(?:Service|Controller|Handler|Repository|Manager|Helper))', error_context)
    
    # try:
    #     async with httpx.AsyncClient(timeout=15) as client:
    #         # Get repo tree
    #         r = await client.get(
    #             f"https://api.github.com/repos/{repo_full_name}/git/trees/HEAD?recursive=1",
    #             headers=headers
    #         )
    #         if r.status_code != 200:
    #             return files
            
    #         tree = r.json().get("tree", [])
    #         # Filter relevant files
    #         relevant = []
    #         for item in tree:
    #             if item.get("type") == "blob":
    #                 path = item["path"]
    #                 if any(cls.lower() in path.lower() for cls in class_match):
    #                     relevant.append(path)
    #                 elif path.endswith((".cs", ".ts", ".py", ".js")) and len(relevant) < 5:
    #                     relevant.append(path)
            
    #         # Fetch up to 3 files
    #         for path in relevant[:3]:
    #             fr = await client.get(
    #                 f"https://api.github.com/repos/{repo_full_name}/contents/{path}",
    #                 headers=headers
    #             )
    #             if fr.status_code == 200:
    #                 import base64
    #                 content_data = fr.json()
    #                 if content_data.get("encoding") == "base64":
    #                     content = base64.b64decode(content_data["content"]).decode("utf-8", errors="ignore")
    #                     files[path] = content[:3000]  # Limit content
    # except Exception as e:
    #     print(f"GitHub fetch error: {e}")
    
    # return files

# async def call_ai(provider: str, model: str, api_key: str, system_prompt: str, user_prompt: str) -> Dict:
#     """Call the configured AI provider and return parsed result dict."""
#     async with httpx.AsyncClient(timeout=60) as client:
#         if provider == "anthropic":
#             r = await client.post(
#                 "https://api.anthropic.com/v1/messages",
#                 headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
#                 json={"model": model, "max_tokens": 2000, "system": system_prompt, "messages": [{"role": "user", "content": user_prompt}]}
#             )
#             if r.status_code != 200:
#                 raise RuntimeError(f"Anthropic {r.status_code}: {r.text[:200]}")
#             resp = r.json()
#             text = resp["content"][0]["text"]
#             tokens_in  = resp.get("usage", {}).get("input_tokens", 0)
#             tokens_out = resp.get("usage", {}).get("output_tokens", 0)
#             cost = (tokens_in / 1_000_000 * 3.0) + (tokens_out / 1_000_000 * 15.0)

#         elif provider == "openai":
#             r = await client.post(
#                 "https://api.openai.com/v1/chat/completions",
#                 headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
#                 json={"model": model, "max_tokens": 2000, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]}
#             )
#             if r.status_code != 200:
#                 raise RuntimeError(f"OpenAI {r.status_code}: {r.text[:200]}")
#             resp = r.json()
#             text = resp["choices"][0]["message"]["content"]
#             tokens_in  = resp.get("usage", {}).get("prompt_tokens", 0)
#             tokens_out = resp.get("usage", {}).get("completion_tokens", 0)
#             cost = (tokens_in / 1_000_000 * 2.5) + (tokens_out / 1_000_000 * 10.0)

#         elif provider == "google":
#             # Use Google's OpenAI-compatible endpoint (Gemini)
#             r = await client.post(
#                 "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
#                 headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
#                 json={"model": model, "max_tokens": 2000, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]}
#             )
#             if r.status_code != 200:
#                 raise RuntimeError(f"Google {r.status_code}: {r.text[:200]}")
#             resp = r.json()
#             text = resp["choices"][0]["message"]["content"]
#             tokens_in  = resp.get("usage", {}).get("prompt_tokens", 0)
#             tokens_out = resp.get("usage", {}).get("completion_tokens", 0)
#             # Gemini pricing varies by model; use conservative estimate
#             cost = (tokens_in / 1_000_000 * 1.25) + (tokens_out / 1_000_000 * 5.0)

#         else:
#             raise RuntimeError(f"Unsupported provider: {provider}")

#     # Strip markdown fences if present
#     json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
#     raw = json_match.group(1) if json_match else text
#     try:
#         result = json.loads(raw)
#     except json.JSONDecodeError:
#         result = {"rca": text[:500], "explanation": text[500:1000] if len(text) > 500 else "",
#                   "severity": "medium", "proposed_changes": [], "testing_notes": "Review manually."}
#     result.update({"tokens_in": tokens_in, "tokens_out": tokens_out, "cost_usd": round(cost, 4)})
#     return result

# async def create_github_pr(fix: Dict, error: Dict, gh_config: Dict) -> Dict:
#     """Create a real GitHub PR for the fix"""
#     token = gh_config.get("token", "")
#     org = gh_config.get("org", "")
#     repo = error.get("repo", "")
    
#     if not token or not org or not repo:
#         return {"success": False, "error": "GitHub not configured"}
    
#     headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json"}
#     repo_full = f"{org}/{repo}"
    
#     async with httpx.AsyncClient(timeout=30) as client:
#         # Get default branch
#         r = await client.get(f"https://api.github.com/repos/{repo_full}", headers=headers)
#         if r.status_code != 200:
#             return {"success": False, "error": f"Cannot access repo: {r.status_code}"}
        
#         default_branch = r.json().get("default_branch", "main")
        
#         # Get latest commit SHA
#         r2 = await client.get(f"https://api.github.com/repos/{repo_full}/git/ref/heads/{default_branch}", headers=headers)
#         if r2.status_code != 200:
#             return {"success": False, "error": "Cannot get branch SHA"}
        
#         sha = r2.json()["object"]["sha"]
        
#         # Create branch
#         branch_name = f"fix/ai-errmon-{fix.get('_id', 'fix')}"
#         r3 = await client.post(f"https://api.github.com/repos/{repo_full}/git/refs", 
#             headers=headers, json={"ref": f"refs/heads/{branch_name}", "sha": sha})
#         if r3.status_code not in (201, 422):  # 422 = branch exists
#             return {"success": False, "error": f"Cannot create branch: {r3.status_code}"}
        
#         # Create PR
#         pr_body = f"""## AI-Generated Fix

# **Root Cause:** {fix.get('rca', '')[:500]}

# **Explanation:** {fix.get('explanation', '')[:500]}

# **Testing Notes:**
# {fix.get('testing_notes', '')}

# ---
# *Generated by AI Error Monitor | Model: {fix.get('model', 'claude')} | Cost: ${fix.get('cost_usd', 0):.4f}*"""
        
#         r4 = await client.post(f"https://api.github.com/repos/{repo_full}/pulls", 
#             headers=headers, json={
#                 "title": f"fix: AI-generated fix for {error.get('error_type', 'error')} in {repo}",
#                 "body": pr_body,
#                 "head": branch_name,
#                 "base": default_branch
#             })
        
#         if r4.status_code == 201:
#             pr = r4.json()
#             return {"success": True, "pr_number": pr["number"], "pr_url": pr["html_url"], "branch": branch_name}
#         else:
#             return {"success": False, "error": f"PR creation failed: {r4.status_code} {r4.text[:200]}"}

# async def create_jira_ticket(fix: Dict, error: Dict, jira_config: Dict, board_key: str, epic_key: Optional[str] = None) -> Dict:
#     """Create a real Jira ticket"""
#     email = jira_config.get("email", "")
#     token = jira_config.get("token", "")
#     base_url = jira_config.get("base_url", "").rstrip("/")
    
#     if not email or not token or not base_url:
#         return {"success": False, "error": "Jira not configured"}
    
#     import base64
#     auth = base64.b64encode(f"{email}:{token}".encode()).decode()
#     headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json", "Accept": "application/json"}
    
#     # Find custom fields from board config
#     boards = jira_config.get("boards", [])
#     board = next((b for b in boards if b.get("key") == board_key), {})
#     custom_fields = {}
#     for f in board.get("custom_fields", []):
#         if f.get("id") and f.get("value"):
#             try:
#                 custom_fields[f["id"]] = json.loads(f["value"])
#             except:
#                 custom_fields[f["id"]] = f["value"]
    
#     issue_data = {
#         "fields": {
#             "project": {"key": board_key},
#             "summary": f"[AI Fix] {error.get('error_type', 'Error')} in {error.get('service', 'service')}",
#             "description": {
#                 "type": "doc",
#                 "version": 1,
#                 "content": [{
#                     "type": "paragraph",
#                     "content": [{"type": "text", "text": f"Root Cause: {fix.get('rca', '')[:1000]}"}]
#                 }]
#             },
#             "issuetype": {"name": "Bug"},
#             **custom_fields
#         }
#     }
    
#     if epic_key:
#         issue_data["fields"]["parent"] = {"key": epic_key}
    
#     async with httpx.AsyncClient(timeout=15) as client:
#         r = await client.post(f"{base_url}/rest/api/3/issue", headers=headers, json=issue_data)
#         if r.status_code == 201:
#             issue = r.json()
#             return {
#                 "success": True,
#                 "jira_id": issue["key"],
#                 "jira_url": f"{base_url}/browse/{issue['key']}"
#             }
#         else:
#             return {"success": False, "error": f"Jira returned {r.status_code}: {r.text[:300]}"}
