from __future__ import annotations

from dataclasses import dataclass, field
<<<<<<< codex/create-clockify-style-self-hosted-time-system
from datetime import UTC, date, datetime
=======
from datetime import UTC, datetime
>>>>>>> main
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


<<<<<<< codex/create-clockify-style-self-hosted-time-system
class TimesheetStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    LOCKED = "locked"


class ProjectStatus(StrEnum):
    ACTIVE = "active"
=======
class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
>>>>>>> main
    ARCHIVED = "archived"


class ProjectAccess(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"


<<<<<<< codex/create-clockify-style-self-hosted-time-system
class ReportGroupBy(StrEnum):
    USER = "user"
    CLIENT = "client"
    PROJECT = "project"
    TASK = "task"
    TAG = "tag"
    DESCRIPTION = "description"
    DAY = "day"


=======
>>>>>>> main
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
<<<<<<< codex/create-clockify-style-self-hosted-time-system
    color: str = "#64748b"
    status: ProjectStatus = ProjectStatus.ACTIVE
    access: ProjectAccess = ProjectAccess.PUBLIC
    estimate_seconds: int | None = None
=======
    color: str | None = None
    status: ProjectStatus = ProjectStatus.ACTIVE
    estimated_hours: Decimal | None = None
    access: ProjectAccess = ProjectAccess.PUBLIC
    is_favorite: bool = False
>>>>>>> main
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
<<<<<<< codex/create-clockify-style-self-hosted-time-system
    color: str = "#38bdf8"
=======
    color: str | None = None
>>>>>>> main
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
<<<<<<< codex/create-clockify-style-self-hosted-time-system
    tag_ids: list[str] = field(default_factory=list)
=======
>>>>>>> main
    is_billable: bool = False
    billable_rate_snapshot: Decimal = Decimal("0")
    cost_rate_snapshot: Decimal = Decimal("0")
    source: TimeEntrySource = TimeEntrySource.WEB
    approval_status: ApprovalStatus = ApprovalStatus.DRAFT
    timezone: str = "UTC"
<<<<<<< codex/create-clockify-style-self-hosted-time-system
    id: str = field(default_factory=new_id)
    deleted_at: datetime | None = None
    locked_at: datetime | None = None
=======
    tag_ids: list[str] = field(default_factory=list)
    id: str = field(default_factory=new_id)
    deleted_at: datetime | None = None
>>>>>>> main

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


<<<<<<< codex/create-clockify-style-self-hosted-time-system
@dataclass
class TimesheetPeriod:
    workspace_id: str
    user_id: str
    period_start: date
    period_end: date
    status: TimesheetStatus = TimesheetStatus.DRAFT
    submitted_at: datetime | None = None
    decided_at: datetime | None = None
    decided_by_user_id: str | None = None
    decision_reason: str | None = None
    locked_at: datetime | None = None
    id: str = field(default_factory=new_id)
=======
@dataclass(frozen=True)
class ProjectSummary:
    """Per-project rollup over completed time entries (read model for the projects table)."""

    project_id: str
    tracked_seconds: int = 0
    billable_seconds: int = 0
    billable_amount: Decimal = Decimal("0")
    estimated_hours: Decimal | None = None
    progress: Decimal | None = None
>>>>>>> main


@dataclass(frozen=True)
class AuditLog:
    workspace_id: str
    actor_user_id: str
    action: str
    target_type: str
    target_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    reason: str | None = None
<<<<<<< codex/create-clockify-style-self-hosted-time-system
    old_value: dict[str, object] = field(default_factory=dict)
    new_value: dict[str, object] = field(default_factory=dict)
    metadata: dict[str, object] = field(default_factory=dict)
    id: str = field(default_factory=new_id)


@dataclass(frozen=True)
class WeeklyUserSummary:
    user_id: str
    total_seconds: int
    billable_seconds: int
    revenue: Decimal
    labor_cost: Decimal


@dataclass(frozen=True)
class MonthlyIncomeSummary:
    workspace_id: str
    year: int
    month: int
    billable_seconds: int
    revenue: Decimal
    labor_cost: Decimal
    profit: Decimal


@dataclass(frozen=True)
class ReportQuery:
    workspace_id: str
    start_at: datetime
    end_at: datetime
    user_ids: tuple[str, ...] = ()
    client_ids: tuple[str, ...] = ()
    project_ids: tuple[str, ...] = ()
    task_ids: tuple[str, ...] = ()
    tag_ids: tuple[str, ...] = ()
    description_contains: str | None = None
    group_by: ReportGroupBy = ReportGroupBy.PROJECT
    include_running: bool = False


@dataclass(frozen=True)
class ReportSummaryRow:
    group_key: str
    group_label: str
    total_seconds: int
    billable_seconds: int
    revenue: Decimal
    labor_cost: Decimal


@dataclass(frozen=True)
class TimeTrackerEntry:
    id: str
    description: str
    project_id: str | None
    project_name: str | None
    project_color: str | None
    client_name: str | None
    task_id: str | None
    task_name: str | None
    tags: tuple[Tag, ...]
    start_at: datetime
    end_at: datetime | None
    duration_seconds: int
    is_running: bool
    is_billable: bool


@dataclass(frozen=True)
class TimeTrackerDay:
    day: date
    total_seconds: int
    entries: tuple[TimeTrackerEntry, ...]


@dataclass(frozen=True)
class TimeTrackerWeek:
    workspace_id: str
    user_id: str
    week_start: date
    week_end: date
    total_seconds: int
    days: tuple[TimeTrackerDay, ...]


@dataclass(frozen=True)
class CalendarEvent:
    id: str
    user_id: str
    title: str
    project_name: str | None
    client_name: str | None
    task_name: str | None
    project_color: str | None
    tag_names: tuple[str, ...]
    start_at: datetime
    end_at: datetime | None
    duration_seconds: int


@dataclass(frozen=True)
class CalendarDay:
    day: date
    total_seconds: int
    events: tuple[CalendarEvent, ...]


@dataclass(frozen=True)
class CalendarWeek:
    workspace_id: str
    week_start: date
    week_end: date
    user_ids: tuple[str, ...]
    total_seconds: int
    days: tuple[CalendarDay, ...]
=======
    metadata: dict[str, object] = field(default_factory=dict)
    id: str = field(default_factory=new_id)
>>>>>>> main
