"""
GitHub API Utility Module
Provides methods for creating branches, commits, and pull requests.
"""
import httpx
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class GitHubAPI:
    """GitHub API client for managing repositories and pull requests."""
    
    def __init__(self, token: str, org: str):
        """Initialize GitHub API client.
        
        Args:
            token: GitHub personal access token
            org: GitHub organization name
        """
        self.token = token
        self.org = org
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
    
    async def get_repository_info(self, repo_name: str) -> Dict[str, Any]:
        """Get repository information.
        
        Args:
            repo_name: Repository name
            
        Returns:
            Dictionary with repository info
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{self.base_url}/repos/{self.org}/{repo_name}",
                    headers=self.headers
                )
                if r.status_code == 200:
                    return r.json()
                else:
                    logger.error(f"Failed to get repo info: {r.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Error getting repo info: {e}")
            return None
    
    async def get_default_branch(self, repo_name: str) -> str:
        """Get the default branch of a repository.
        
        Args:
            repo_name: Repository name
            
        Returns:
            Default branch name (usually 'main' or 'master')
        """
        repo_info = await self.get_repository_info(repo_name)
        if repo_info:
            return repo_info.get("default_branch", "main")
        return "main"
    
    async def get_latest_commit_sha(self, repo_name: str, branch: str = "main") -> Optional[str]:
        """Get the latest commit SHA of a branch.
        
        Args:
            repo_name: Repository name
            branch: Branch name
            
        Returns:
            Latest commit SHA
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{self.base_url}/repos/{self.org}/{repo_name}/git/ref/heads/{branch}",
                    headers=self.headers
                )
                if r.status_code == 200:
                    return r.json()["object"]["sha"]
                else:
                    logger.error(f"Failed to get commit SHA: {r.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Error getting commit SHA: {e}")
            return None
    
    async def create_branch(self, repo_name: str, branch_name: str, 
                           base_branch: str = "main") -> Dict[str, Any]:
        """Create a new branch in the repository.
        
        Args:
            repo_name: Repository name
            branch_name: New branch name
            base_branch: Base branch to branch from
            
        Returns:
            Dictionary with branch creation result
        """
        try:
            # Get SHA of base branch
            base_sha = await self.get_latest_commit_sha(repo_name, base_branch)
            if not base_sha:
                return {"success": False, "error": f"Could not get SHA for {base_branch}"}
            
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{self.base_url}/repos/{self.org}/{repo_name}/git/refs",
                    headers=self.headers,
                    json={"ref": f"refs/heads/{branch_name}", "sha": base_sha}
                )
                
                if r.status_code == 201:
                    logger.info(f"Branch created: {branch_name}")
                    return {"success": True, "branch": branch_name}
                elif r.status_code == 422:  # Branch already exists
                    logger.warning(f"Branch already exists: {branch_name}")
                    return {"success": True, "branch": branch_name, "note": "already_exists"}
                else:
                    error = r.json() if r.headers.get("content-type") == "application/json" else r.text
                    logger.error(f"Failed to create branch: {r.status_code} - {error}")
                    return {"success": False, "error": f"GitHub API error: {r.status_code}"}
        except Exception as e:
            logger.error(f"Error creating branch: {e}")
            return {"success": False, "error": str(e)}
    
    async def create_pull_request(self, repo_name: str, title: str, body: str,
                                 head_branch: str, base_branch: str = "main",
                                 draft: bool = False) -> Dict[str, Any]:
        """Create a pull request.
        
        Args:
            repo_name: Repository name
            title: PR title
            body: PR description
            head_branch: Branch with changes
            base_branch: Target branch for PR
            draft: Whether to create as draft
            
        Returns:
            Dictionary with PR details
        """
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    f"{self.base_url}/repos/{self.org}/{repo_name}/pulls",
                    headers=self.headers,
                    json={
                        "title": title,
                        "body": body,
                        "head": head_branch,
                        "base": base_branch,
                        "draft": draft
                    }
                )
                
                if r.status_code == 201:
                    pr_data = r.json()
                    logger.info(f"PR created: {pr_data.get('html_url')}")
                    return {
                        "success": True,
                        "pr_number": pr_data.get("number"),
                        "pr_url": pr_data.get("html_url"),
                        "pr_id": pr_data.get("id")
                    }
                elif r.status_code == 422:  # PR already exists
                    logger.warning(f"PR might already exist for {head_branch}")
                    error_data = r.json()
                    return {"success": False, "error": "PR already exists", "details": error_data}
                else:
                    error_data = r.json() if r.headers.get("content-type") == "application/json" else r.text
                    logger.error(f"Failed to create PR: {r.status_code} - {error_data}")
                    return {"success": False, "error": f"GitHub API error: {r.status_code}"}
        except Exception as e:
            logger.error(f"Error creating PR: {e}")
            return {"success": False, "error": str(e)}
    
    async def add_pr_comment(self, repo_name: str, pr_number: int, 
                            comment: str) -> Dict[str, Any]:
        """Add a comment to a pull request.
        
        Args:
            repo_name: Repository name
            pr_number: PR number
            comment: Comment text
            
        Returns:
            Dictionary with comment result
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{self.base_url}/repos/{self.org}/{repo_name}/issues/{pr_number}/comments",
                    headers=self.headers,
                    json={"body": comment}
                )
                
                if r.status_code == 201:
                    comment_data = r.json()
                    logger.info(f"Comment added to PR #{pr_number}")
                    return {
                        "success": True,
                        "comment_id": comment_data.get("id"),
                        "comment_url": comment_data.get("html_url")
                    }
                else:
                    logger.error(f"Failed to add comment: {r.status_code}")
                    return {"success": False, "error": f"GitHub API error: {r.status_code}"}
        except Exception as e:
            logger.error(f"Error adding PR comment: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_pr_details(self, repo_name: str, pr_number: int) -> Dict[str, Any]:
        """Get pull request details.
        
        Args:
            repo_name: Repository name
            pr_number: PR number
            
        Returns:
            Dictionary with PR details
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{self.base_url}/repos/{self.org}/{repo_name}/pulls/{pr_number}",
                    headers=self.headers
                )
                
                if r.status_code == 200:
                    return r.json()
                else:
                    logger.error(f"Failed to get PR details: {r.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Error getting PR details: {e}")
            return None
    
    async def update_branch_protection(self, repo_name: str, branch: str,
                                      required_reviewers: int = 1) -> Dict[str, Any]:
        """Update branch protection rules (requires admin access).
        
        Args:
            repo_name: Repository name
            branch: Branch name
            required_reviewers: Number of required reviewers
            
        Returns:
            Dictionary with result
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.patch(
                    f"{self.base_url}/repos/{self.org}/{repo_name}/branches/{branch}/protection",
                    headers={**self.headers, "Accept": "application/vnd.github.loki-preview+json"},
                    json={
                        "required_status_checks": None,
                        "enforce_admins": False,
                        "required_pull_request_reviews": {
                            "required_approving_review_count": required_reviewers
                        },
                        "restrictions": None
                    }
                )
                
                if r.status_code == 200:
                    logger.info(f"Branch protection updated for {branch}")
                    return {"success": True}
                else:
                    logger.error(f"Failed to update branch protection: {r.status_code}")
                    return {"success": False, "error": f"GitHub API error: {r.status_code}"}
        except Exception as e:
            logger.error(f"Error updating branch protection: {e}")
            return {"success": False, "error": str(e)}
    
    async def create_commit(self, repo_name: str, branch: str, message: str,
                           changes: Dict[str, str], author_name: str = "AI Error Fixer",
                           author_email: str = "ai-fixer@errmon.local") -> Dict[str, Any]:
        """Create a commit via GitHub API (for smaller changes).
        
        Note: This method creates commits through file updates.
        For larger changes, use local git operations.
        
        Args:
            repo_name: Repository name
            branch: Branch name
            message: Commit message
            changes: Dictionary of {file_path: file_content}
            author_name: Commit author name
            author_email: Commit author email
            
        Returns:
            Dictionary with commit result
        """
        try:
            results = []
            for file_path, content in changes.items():
                # Get current file SHA if it exists
                sha = None
                get_url = f"{self.base_url}/repos/{self.org}/{repo_name}/contents/{file_path}?ref={branch}"
                
                async with httpx.AsyncClient(timeout=15) as client:
                    get_r = await client.get(get_url, headers=self.headers)
                    if get_r.status_code == 200:
                        sha = get_r.json().get("sha")
                    
                    # Put file
                    put_r = await client.put(
                        get_url,
                        headers=self.headers,
                        json={
                            "message": message,
                            "content": __import__("base64").b64encode(content.encode()).decode(),
                            "sha": sha,
                            "branch": branch,
                            "author": {
                                "name": author_name,
                                "email": author_email
                            },
                            "committer": {
                                "name": author_name,
                                "email": author_email
                            }
                        }
                    )
                    
                    if put_r.status_code in (200, 201):
                        results.append({"file": file_path, "success": True})
                        logger.info(f"Committed: {file_path}")
                    else:
                        results.append({"file": file_path, "success": False, "error": put_r.status_code})
                        logger.error(f"Failed to commit {file_path}: {put_r.status_code}")
            
            return {
                "success": all(r.get("success") for r in results),
                "commits": results
            }
        except Exception as e:
            logger.error(f"Error creating commit: {e}")
            return {"success": False, "error": str(e)}
