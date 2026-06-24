from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from .models import AuditLog, Client, Project, Task, TimeEntry, TimeEntrySource, User, Workspace


class TimeOpsService:
    """In-memory Phase 1 application service with auditable time-entry operations."""

    def __init__(self) -> None:
        self.workspaces: dict[str, Workspace] = {}
        self.users: dict[str, User] = {}
        self.clients: dict[str, Client] = {}
        self.projects: dict[str, Project] = {}
        self.tasks: dict[str, Task] = {}
        self.time_entries: dict[str, TimeEntry] = {}
        self.audit_logs: list[AuditLog] = []

    def create_workspace(self, name: str, *, default_billable_rate: Decimal = Decimal("0"), currency: str = "USD") -> Workspace:
        workspace = Workspace(name=name, default_billable_rate=default_billable_rate, currency=currency)
        self.workspaces[workspace.id] = workspace
        return workspace

    def add_user(self, workspace_id: str, name: str, email: str, *, default_cost_rate: Decimal = Decimal("0")) -> User:
        self._require_workspace(workspace_id)
        user = User(workspace_id=workspace_id, name=name, email=email, default_cost_rate=default_cost_rate)
        self.users[user.id] = user
        return user

    def add_client(self, workspace_id: str, name: str) -> Client:
        self._require_workspace(workspace_id)
        client = Client(workspace_id=workspace_id, name=name)
        self.clients[client.id] = client
        return client

    def add_project(self, workspace_id: str, name: str, *, client_id: str | None = None, billable_rate: Decimal | None = None) -> Project:
        self._require_workspace(workspace_id)
        project = Project(workspace_id=workspace_id, name=name, client_id=client_id, billable_rate=billable_rate)
        self.projects[project.id] = project
        return project

    def add_task(self, workspace_id: str, project_id: str, name: str, *, billable_rate: Decimal | None = None) -> Task:
        self._require_workspace(workspace_id)
        if project_id not in self.projects:
            raise KeyError("Unknown project")
        task = Task(workspace_id=workspace_id, project_id=project_id, name=name, billable_rate=billable_rate)
        self.tasks[task.id] = task
        return task

    def start_timer(self, workspace_id: str, user_id: str, *, actor_user_id: str | None = None, description: str = "", project_id: str | None = None, task_id: str | None = None, is_billable: bool = False, started_at: datetime | None = None) -> TimeEntry:
        self._ensure_no_running_entry(workspace_id, user_id)
        entry = TimeEntry(
            workspace_id=workspace_id,
            user_id=user_id,
            created_by_user_id=actor_user_id or user_id,
            description=description,
            start_at=started_at or datetime.now(UTC),
            project_id=project_id,
            task_id=task_id,
            is_billable=is_billable,
            billable_rate_snapshot=self._resolve_billable_rate(workspace_id, project_id, task_id) if is_billable else Decimal("0"),
            cost_rate_snapshot=self.users[user_id].default_cost_rate,
        )
        self.time_entries[entry.id] = entry
        self._audit(workspace_id, entry.created_by_user_id, "time_entry.started", "time_entry", entry.id)
        return entry

    def stop_timer(self, entry_id: str, *, actor_user_id: str, stopped_at: datetime | None = None) -> TimeEntry:
        entry = self.time_entries[entry_id]
        entry.stop(stopped_at or datetime.now(UTC))
        self._audit(entry.workspace_id, actor_user_id, "time_entry.stopped", "time_entry", entry.id, metadata={"duration_seconds": entry.duration_seconds})
        return entry

    def add_manual_entry(self, workspace_id: str, user_id: str, *, actor_user_id: str | None = None, description: str, start_at: datetime, end_at: datetime, project_id: str | None = None, task_id: str | None = None, is_billable: bool = False) -> TimeEntry:
        if end_at <= start_at:
            raise ValueError("End time must be after start time")
        actor = actor_user_id or user_id
        source = TimeEntrySource.MANAGER_MANUAL if actor != user_id else TimeEntrySource.WEB
        entry = TimeEntry(
            workspace_id=workspace_id,
            user_id=user_id,
            created_by_user_id=actor,
            description=description,
            start_at=start_at,
            end_at=end_at,
            duration_seconds=int((end_at - start_at).total_seconds()),
            project_id=project_id,
            task_id=task_id,
            is_billable=is_billable,
            billable_rate_snapshot=self._resolve_billable_rate(workspace_id, project_id, task_id) if is_billable else Decimal("0"),
            cost_rate_snapshot=self.users[user_id].default_cost_rate,
            source=source,
        )
        self.time_entries[entry.id] = entry
        self._audit(workspace_id, actor, "time_entry.created", "time_entry", entry.id)
        return entry

    def weekly_summary(self, workspace_id: str, week_start: date) -> dict[str, int]:
        start = datetime.combine(week_start, time.min, tzinfo=UTC)
        end = start + timedelta(days=7)
        totals: dict[str, int] = defaultdict(int)
        for entry in self._completed_entries(workspace_id):
            if start <= entry.start_at < end:
                totals[entry.user_id] += entry.duration_seconds
        return dict(totals)

    def monthly_income(self, workspace_id: str, year: int, month: int) -> Decimal:
        total = Decimal("0")
        for entry in self._completed_entries(workspace_id):
            if entry.start_at.year == year and entry.start_at.month == month and entry.is_billable:
                total += Decimal(entry.duration_seconds) / Decimal(3600) * entry.billable_rate_snapshot
        return total.quantize(Decimal("0.01"))

    def export_csv(self, workspace_id: str) -> str:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["entry_id", "user", "project", "task", "description", "start_at", "end_at", "duration_hours", "billable", "billable_rate"])
        for entry in self._completed_entries(workspace_id):
            writer.writerow([
                entry.id,
                self.users[entry.user_id].email,
                self.projects[entry.project_id].name if entry.project_id else "",
                self.tasks[entry.task_id].name if entry.task_id else "",
                entry.description,
                entry.start_at.isoformat(),
                entry.end_at.isoformat() if entry.end_at else "",
                f"{entry.duration_seconds / 3600:.2f}",
                str(entry.is_billable).lower(),
                str(entry.billable_rate_snapshot),
            ])
        return buffer.getvalue()

    def _completed_entries(self, workspace_id: str) -> list[TimeEntry]:
        return [entry for entry in self.time_entries.values() if entry.workspace_id == workspace_id and not entry.is_running and entry.deleted_at is None]

    def _resolve_billable_rate(self, workspace_id: str, project_id: str | None, task_id: str | None) -> Decimal:
        if task_id and self.tasks[task_id].billable_rate is not None:
            return self.tasks[task_id].billable_rate or Decimal("0")
        if project_id and self.projects[project_id].billable_rate is not None:
            return self.projects[project_id].billable_rate or Decimal("0")
        return self.workspaces[workspace_id].default_billable_rate

    def _ensure_no_running_entry(self, workspace_id: str, user_id: str) -> None:
        if any(entry.workspace_id == workspace_id and entry.user_id == user_id and entry.is_running for entry in self.time_entries.values()):
            raise ValueError("User already has a running timer")

    def _require_workspace(self, workspace_id: str) -> None:
        if workspace_id not in self.workspaces:
            raise KeyError("Unknown workspace")

    def _audit(self, workspace_id: str, actor_user_id: str, action: str, target_type: str, target_id: str, *, metadata: dict[str, object] | None = None) -> None:
        self.audit_logs.append(AuditLog(workspace_id=workspace_id, actor_user_id=actor_user_id, action=action, target_type=target_type, target_id=target_id, metadata=metadata or {}))
