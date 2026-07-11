from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from apps.api.timeops_core.models import ProjectAccess, ProjectStatus, ReportGroupBy, WorkspaceRole


class CreateWorkspaceRequest(BaseModel):
    name: str
    default_billable_rate: Decimal = Decimal("0")
    currency: str = "USD"


class CreateUserRequest(BaseModel):
    workspace_id: str
    name: str
    email: str
    default_cost_rate: Decimal = Decimal("0")
    role: WorkspaceRole = WorkspaceRole.MEMBER


class CreateClientRequest(BaseModel):
    workspace_id: str
    name: str


class CreateProjectRequest(BaseModel):
    workspace_id: str
    name: str
    client_id: str | None = None
    billable_rate: Decimal | None = None
    color: str = "#64748b"
    status: ProjectStatus = ProjectStatus.ACTIVE
    access: ProjectAccess = ProjectAccess.PUBLIC
    estimate_seconds: int | None = Field(default=None, ge=0)
    budget_amount: Decimal | None = Field(default=None, ge=0)
    template_name: str | None = None


class CreateTagRequest(BaseModel):
    workspace_id: str
    name: str
    color: str = "#38bdf8"


class StartTimerRequest(BaseModel):
    workspace_id: str
    user_id: str
    actor_user_id: str | None = None
    description: str = ""
    project_id: str | None = None
    task_id: str | None = None
    tag_ids: tuple[str, ...] = ()
    is_billable: bool = False
    started_at: datetime | None = None


class StopTimerRequest(BaseModel):
    actor_user_id: str
    stopped_at: datetime | None = None


class ManualEntryRequest(BaseModel):
    workspace_id: str
    user_id: str
    actor_user_id: str | None = None
    description: str
    start_at: datetime
    end_at: datetime
    project_id: str | None = None
    task_id: str | None = None
    tag_ids: tuple[str, ...] = ()
    is_billable: bool = False


class ReportSummaryRequest(BaseModel):
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


class WeekQuery(BaseModel):
    workspace_id: str
    week_start: date
    user_id: str | None = None
    user_ids: tuple[str, ...] = ()
