from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import uuid4


def new_id() -> str:
    return uuid4().hex


class TimeEntrySource(StrEnum):
    WEB = "web"
    API = "api"
    IMPORT = "import"
    MANAGER_MANUAL = "manager_manual"


class ApprovalStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    LOCKED = "locked"


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    ARCHIVED = "archived"


@dataclass(frozen=True)
class Workspace:
    name: str
    default_billable_rate: Decimal = Decimal("0")
    default_cost_rate: Decimal = Decimal("0")
    currency: str = "USD"
    id: str = field(default_factory=new_id)


@dataclass(frozen=True)
class User:
    workspace_id: str
    name: str
    email: str
    default_cost_rate: Decimal = Decimal("0")
    id: str = field(default_factory=new_id)


@dataclass(frozen=True)
class Client:
    workspace_id: str
    name: str
    id: str = field(default_factory=new_id)


@dataclass(frozen=True)
class Project:
    workspace_id: str
    name: str
    client_id: str | None = None
    billable_rate: Decimal | None = None
    color: str | None = None
    status: ProjectStatus = ProjectStatus.ACTIVE
    estimated_hours: Decimal | None = None
    id: str = field(default_factory=new_id)


@dataclass(frozen=True)
class Task:
    workspace_id: str
    project_id: str
    name: str
    billable_rate: Decimal | None = None
    id: str = field(default_factory=new_id)


@dataclass(frozen=True)
class Tag:
    workspace_id: str
    name: str
    color: str | None = None
    id: str = field(default_factory=new_id)


@dataclass
class TimeEntry:
    workspace_id: str
    user_id: str
    created_by_user_id: str
    description: str
    start_at: datetime
    end_at: datetime | None = None
    duration_seconds: int = 0
    project_id: str | None = None
    task_id: str | None = None
    is_billable: bool = False
    billable_rate_snapshot: Decimal = Decimal("0")
    cost_rate_snapshot: Decimal = Decimal("0")
    source: TimeEntrySource = TimeEntrySource.WEB
    approval_status: ApprovalStatus = ApprovalStatus.DRAFT
    timezone: str = "UTC"
    tag_ids: list[str] = field(default_factory=list)
    id: str = field(default_factory=new_id)
    deleted_at: datetime | None = None

    @property
    def is_running(self) -> bool:
        return self.end_at is None and self.deleted_at is None

    def stop(self, stopped_at: datetime) -> None:
        if not self.is_running:
            raise ValueError("Only a running time entry can be stopped")
        if stopped_at <= self.start_at:
            raise ValueError("Stop time must be after start time")
        self.end_at = stopped_at
        self.duration_seconds = int((stopped_at - self.start_at).total_seconds())


@dataclass(frozen=True)
class ProjectSummary:
    """Per-project rollup over completed time entries (read model for the projects table)."""

    project_id: str
    tracked_seconds: int = 0
    billable_seconds: int = 0
    billable_amount: Decimal = Decimal("0")
    estimated_hours: Decimal | None = None
    progress: Decimal | None = None


@dataclass(frozen=True)
class AuditLog:
    workspace_id: str
    actor_user_id: str
    action: str
    target_type: str
    target_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    reason: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)
    id: str = field(default_factory=new_id)
