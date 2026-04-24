"""
AI-Powered Error Fix Generation System
Complete example showing how to use the error analysis and PR creation workflow.
"""

import asyncio
from datetime import datetime

# Example 1: Using the generate_fix endpoint directly
async def example_generate_fix():
    """Example: Generate a fix for an error and create a PR"""
    
    import httpx
    
    repo_name = "Clone_Demo_Repo"
    error_message = """
    TypeError: Cannot read properties of undefined (reading 'map')
    at ErrorDetail.jsx:45 in processErrors function
    Error occurs when trying to map over error.details array which is undefined
    """
    
    prompt = """
    The application is failing because the error object's details property is undefined.
    Please:
    1. Add a null check before accessing error.details
    2. Implement a fallback empty array if details is missing
    3. Add TypeScript type guards or optional chaining
    """
    
    request_data = {
        "repo_name": repo_name,
        "error_message": error_message,
        "prompt": prompt
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/fixes/generate",
            json=request_data,
            timeout=120.0  # Long timeout for AI processing
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✓ Fix generated successfully!")
            print(f"PR URL: {result.get('pr_info', {}).get('pr_url')}")
            print(f"PR Number: {result.get('pr_info', {}).get('pr_number')}")
            print(f"Branch: {result.get('pr_info', {}).get('branch_name')}")
        else:
            print(f"✗ Error: {response.status_code}")
            print(response.text)


# Example 2: Direct use of ai_service functions
async def example_direct_service():
    """Example: Direct use of AI service functions"""
    from ai_service import generate_fix
    
    repo_name = "Clone_Demo_Repo"
    
    error_message = """
    Syntax Error: Unexpected token '}'
    at App.jsx:156
    The file has a mismatched closing brace in the component
    """
    
    prompt = """
    There's a syntax error. Please:
    1. Review the JSX structure
    2. Find and fix mismatched braces
    3. Ensure all components are properly closed
    """
    
    result = await generate_fix(repo_name, error_message, prompt)
    print("Async result:")
    print(result)


# Example 3: Using GitHub API directly
async def example_github_api():
    """Example: Use GitHub API utilities"""
    from github_api import GitHubAPI
    
    gh_token = "your_github_token"
    org = "your_org"
    repo = "Clone_Demo_Repo"
    
    gh = GitHubAPI(gh_token, org)
    
    # Create a branch
    branch_result = await gh.create_branch(repo, "fix/ai-detected-error-001", "main")
    if branch_result["success"]:
        print(f"✓ Branch created: {branch_result['branch']}")
    
    # Create a PR
    pr_result = await gh.create_pull_request(
        repo,
        title="fix: AI-generated fix for undefined reference",
        body="""## AI-Generated Fix
        
This PR addresses an issue where error.details was undefined.

### Changes
- Added null check before accessing details array
- Implemented fallback to empty array
- Added proper type guards

### Testing
- Test with missing error.details
- Verify fallback behavior works correctly
""",
        head_branch="fix/ai-detected-error-001",
        base_branch="main"
    )
    
    if pr_result["success"]:
        print(f"✓ PR created: {pr_result['pr_url']}")
        print(f"  PR #: {pr_result['pr_number']}")


# Example 4: End-to-end workflow
async def example_end_to_end():
    """Example: Complete end-to-end workflow"""
    
    print("=" * 60)
    print("AI Error Fix Generation - End-to-End Workflow")
    print("=" * 60)
    
    # Step 1: Error detection
    error_data = {
        "error_type": "TypeError",
        "service": "frontend",
        "repo": "Clone_Demo_Repo",
        "message": "Cannot read properties of undefined (reading 'map')",
        "stack_trace": "at ErrorDetail.jsx:45:12",
        "occurrences": 3,
        "first_seen": datetime.now().isoformat()
    }
    
    print("\n1. Error Detected:")
    print(f"   Type: {error_data['error_type']}")
    print(f"   Service: {error_data['service']}")
    print(f"   Occurrences: {error_data['occurrences']}")
    
    # Step 2: Generate fix using AI
    from ai_service import generate_fix
    
    print("\n2. Analyzing error with AI...")
    fix_prompt = """
    The error indicates that error.details array is undefined when trying to iterate.
    Please provide:
    1. Root cause analysis
    2. Code changes needed
    3. Testing approach
    """
    
    result = await generate_fix(
        repo_name=error_data["repo"],
        error_message=error_data["message"],
        prompt=fix_prompt
    )
    
    print("\n3. AI Response:")
    print(result[:500])
    
    # Step 3: Review and approve (would be done by human reviewer)
    print("\n4. Awaiting code review...")
    print("   [In production, a human would review and merge the PR]")
    
    # Step 4: Monitoring
    print("\n5. Post-merge monitoring:")
    print("   - Track error occurrences")
    print("   - Monitor error logs")
    print("   - Verify fix effectiveness")


# Example 5: Configuration and Setup
async def example_configuration():
    """Example: How to configure the system"""
    
    print("""
## Configuration Required

### 1. GitHub Configuration
- Provide a GitHub Personal Access Token with repo, write:public_repo scope
- Set the organization/user name
- Example settings:
  {
    "token": "ghp_xxxxxxxxxxx",
    "org": "your-org",
    "gemini_api_key": "AIzaxxxxxxxxxxxx"
  }

### 2. AI Configuration (Gemini)
- Get API key from Google AI Studio (https://aistudio.google.com/app/apikey)
- Set as investigation_api_key
- Example settings:
  {
    "investigation_api_key": "AIzaxxxxxxxxxxxx",
    "investigation_model": "gemini-flash-latest",
    "investigation_provider": "google"
  }

### 3. Repository Configuration
- Ensure the repository is cloned and accessible via Git
- Set GIT_HUB_REPO in constants
- Set ORG_REPO for display purposes

### 4. API Endpoints
- POST /fixes/generate - Generate fix for error
  Input: { repo_name, error_message, prompt }
  Output: { success, pr_info, fix_response }

### 5. Environment Variables
- GITHUB_TOKEN: Your GitHub token
- GEMINI_API_KEY: Your Gemini AI API key
""")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        example = sys.argv[1]
        if example == "1":
            asyncio.run(example_generate_fix())
        elif example == "2":
            asyncio.run(example_direct_service())
        elif example == "3":
            asyncio.run(example_github_api())
        elif example == "4":
            asyncio.run(example_end_to_end())
        elif example == "5":
            asyncio.run(example_configuration())
    else:
        print("AI Error Fix Generation Examples")
        print("=" * 40)
        print("Run with argument:")
        print("  python ai_fix_examples.py 1 - Generate fix via API")
        print("  python ai_fix_examples.py 2 - Direct service usage")
        print("  python ai_fix_examples.py 3 - GitHub API usage")
        print("  python ai_fix_examples.py 4 - End-to-end workflow")
        print("  python ai_fix_examples.py 5 - Configuration info")
