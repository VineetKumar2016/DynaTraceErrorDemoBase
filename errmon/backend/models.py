from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class ErrorStatus(str, Enum):
    new = "new"
    analyzing = "analyzing"
    fix_generated = "fix_generated"
    pr_created = "pr_created"
    approved = "approved"
    rejected = "rejected"

class FixStatus(str, Enum):
    investigating = "investigating"
    completed = "completed"
    approved = "approved"
    rejected = "rejected"

class AIProvider(str, Enum):
    anthropic = "anthropic"
    bedrock = "bedrock"
    github = "github"

# Settings Models
class GitHubSettings(BaseModel):
    token: Optional[str] = None
    org: Optional[str] = None
    enabled_repos: List[str] = []

class DynatraceSettings(BaseModel):
    platform_token: Optional[str] = None
    api_token: Optional[str] = None
    environment_url: Optional[str] = None

class JiraBoard(BaseModel):
    key: str
    name: str
    is_default: bool = False
    custom_fields: List[Dict[str, str]] = []
    epics: List[Dict[str, Any]] = []

class JiraSettings(BaseModel):
    email: Optional[str] = None
    token: Optional[str] = None
    base_url: Optional[str] = None
    boards: List[JiraBoard] = []

class AISettings(BaseModel):
    provider: AIProvider = AIProvider.anthropic
    investigation_model: str = "claude-sonnet-4-6"
    triage_model: str = "claude-sonnet-4-6"
    api_key: Optional[str] = None
    enable_agentic: bool = True

class PipelineSettings(BaseModel):
    enable_polling: bool = True
    pause_scanning: bool = False
    pause_fix_generation: bool = False
    poll_interval_minutes: int = 5
    max_errors_per_scan: int = 20
    agent_max_tool_calls: int = 30
    agent_max_cost_usd: float = 15.0
    target_environments: str = "prod"
    environment_prefixes: str = "prod-,staging-,dev-,qa-"

class SettingsPayload(BaseModel):
    github: Optional[GitHubSettings] = None
    dynatrace: Optional[DynatraceSettings] = None
    jira: Optional[JiraSettings] = None
    ai: Optional[AISettings] = None
    pipeline: Optional[PipelineSettings] = None

# Error Models
class ErrorRecord(BaseModel):
    fingerprint: str
    error_type: str
    classification: str = "unknown"
    message: str
    service: str
    container: Optional[str] = None
    repo: Optional[str] = None
    occurrences: int = 1
    first_seen: datetime
    last_seen: datetime
    status: ErrorStatus = ErrorStatus.new
    raw_logs: List[Dict] = []

# Fix Models
class FixRecord(BaseModel):
    error_id: str
    status: FixStatus = FixStatus.investigating
    severity: str = "medium"
    model: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    tool_calls: int = 0
    rca: str = ""
    explanation: str = ""
    proposed_changes: List[Dict] = []
    testing_notes: str = ""
    timeline: List[Dict] = []
    pr_status: str = "pending"
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None
    jira_status: str = "pending"
    jira_id: Optional[str] = None
    jira_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    updated_at: datetime = Field(default_factory=lambda: datetime.now())

# Analysis request
class AnalyzeRequest(BaseModel):
    error_id: str

class ApproveRequest(BaseModel):
    fix_id: str
    jira_board_key: str
    jira_epic_key: Optional[str] = None

class ReviseRequest(BaseModel):
    fix_id: str
    feedback: str
