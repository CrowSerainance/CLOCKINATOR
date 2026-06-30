from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from .models import (
    ApprovalStatus,
    AuditLog,
    Client,
    MonthlyIncomeSummary,
    Project,
    Task,
    TimeEntry,
    TimeEntrySource,
    TimesheetPeriod,
    TimesheetStatus,
    User,
    WeeklyUserSummary,
    Workspace,
)

LOCKED_ENTRY_STATUSES = {ApprovalStatus.APPROVED, ApprovalStatus.LOCKED, ApprovalStatus.SUBMITTED}


class TimeOpsService:
    """In-memory Phase 1 application service with auditable time-entry and timesheet operations."""

    def __init__(self, *, single_workspace: bool = True) -> None:
        self.single_workspace = single_workspace
        self.workspaces: dict[str, Workspace] = {}
        self.users: dict[str, User] = {}
        self.clients: dict[str, Client] = {}
        self.projects: dict[str, Project] = {}
        self.tasks: dict[str, Task] = {}
        self.time_entries: dict[str, TimeEntry] = {}
        self.timesheet_periods: dict[str, TimesheetPeriod] = {}
        self.audit_logs: list[AuditLog] = []

    def create_workspace(self, name: str, *, default_billable_rate: Decimal = Decimal("0"), currency: str = "USD") -> Workspace:
        if self.single_workspace and self.workspaces:
            raise ValueError("This service is configured for a single self-hosted workspace")
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

    def add_project(
        self,
        workspace_id: str,
        name: str,
        *,
        client_id: str | None = None,
        billable_rate: Decimal | None = None,
    ) -> Project:
        self._require_workspace(workspace_id)
        if client_id is not None:
            self._require_client(workspace_id, client_id)
        project = Project(workspace_id=workspace_id, name=name, client_id=client_id, billable_rate=billable_rate)
        self.projects[project.id] = project
        return project

    def add_task(self, workspace_id: str, project_id: str, name: str, *, billable_rate: Decimal | None = None) -> Task:
        self._require_workspace(workspace_id)
        self._require_project(workspace_id, project_id)
        task = Task(workspace_id=workspace_id, project_id=project_id, name=name, billable_rate=billable_rate)
        self.tasks[task.id] = task
        return task

    def start_timer(
        self,
        workspace_id: str,
        user_id: str,
        *,
        actor_user_id: str | None = None,
        description: str = "",
        project_id: str | None = None,
        task_id: str | None = None,
        is_billable: bool = False,
        started_at: datetime | None = None,
    ) -> TimeEntry:
        actor = actor_user_id or user_id
        started = started_at or datetime.now(UTC)
        self._validate_entry_context(workspace_id, user_id, actor, project_id, task_id)
        self._require_aware_datetime(started, "started_at")
        self._ensure_no_running_entry(workspace_id, user_id)
        entry = TimeEntry(
            workspace_id=workspace_id,
            user_id=user_id,
            created_by_user_id=actor,
            description=description,
            start_at=started,
            project_id=project_id,
            task_id=task_id,
            is_billable=is_billable,
            billable_rate_snapshot=self._resolve_billable_rate(workspace_id, project_id, task_id) if is_billable else Decimal("0"),
            cost_rate_snapshot=self.users[user_id].default_cost_rate,
        )
        self.time_entries[entry.id] = entry
        self._audit(workspace_id, actor, "time_entry.started", "time_entry", entry.id, new_value=self._entry_snapshot(entry))
        return entry

    def stop_timer(self, entry_id: str, *, actor_user_id: str, stopped_at: datetime | None = None) -> TimeEntry:
        entry = self._require_time_entry(entry_id)
        self._require_user(entry.workspace_id, actor_user_id)
        stopped = stopped_at or datetime.now(UTC)
        self._require_aware_datetime(stopped, "stopped_at")
        old_value = self._entry_snapshot(entry)
        entry.stop(stopped)
        self._audit(
            entry.workspace_id,
            actor_user_id,
            "time_entry.stopped",
            "time_entry",
            entry.id,
            old_value=old_value,
            new_value=self._entry_snapshot(entry),
            metadata={"duration_seconds": entry.duration_seconds},
        )
        return entry

    def add_manual_entry(
        self,
        workspace_id: str,
        user_id: str,
        *,
        actor_user_id: str | None = None,
        description: str,
        start_at: datetime,
        end_at: datetime,
        project_id: str | None = None,
        task_id: str | None = None,
        is_billable: bool = False,
    ) -> TimeEntry:
        actor = actor_user_id or user_id
        self._validate_entry_context(workspace_id, user_id, actor, project_id, task_id)
        self._require_aware_datetime(start_at, "start_at")
        self._require_aware_datetime(end_at, "end_at")
        if end_at <= start_at:
            raise ValueError("End time must be after start time")
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
        self._audit(workspace_id, actor, "time_entry.created", "time_entry", entry.id, new_value=self._entry_snapshot(entry))
        return entry

    def update_time_entry(self, entry_id: str, *, actor_user_id: str, reason: str, **changes: object) -> TimeEntry:
        entry = self._require_time_entry(entry_id)
        self._require_user(entry.workspace_id, actor_user_id)
        self._ensure_entry_editable(entry, reason=reason)
        allowed_fields = {"description", "project_id", "task_id", "is_billable", "start_at", "end_at"}
        unknown_fields = set(changes) - allowed_fields
        if unknown_fields:
            raise ValueError(f"Unsupported time entry fields: {', '.join(sorted(unknown_fields))}")
        old_value = self._entry_snapshot(entry)
        project_id = changes.get("project_id", entry.project_id)
        task_id = changes.get("task_id", entry.task_id)
        self._validate_entry_context(entry.workspace_id, entry.user_id, entry.created_by_user_id, project_id, task_id)
        if "start_at" in changes:
            self._require_aware_datetime(changes["start_at"], "start_at")
        if "end_at" in changes and changes["end_at"] is not None:
            self._require_aware_datetime(changes["end_at"], "end_at")
        for field_name, value in changes.items():
            setattr(entry, field_name, value)
        if entry.end_at is not None:
            if entry.end_at <= entry.start_at:
                raise ValueError("End time must be after start time")
            entry.duration_seconds = int((entry.end_at - entry.start_at).total_seconds())
        if "project_id" in changes or "task_id" in changes or "is_billable" in changes:
            entry.billable_rate_snapshot = self._resolve_billable_rate(entry.workspace_id, entry.project_id, entry.task_id) if entry.is_billable else Decimal("0")
        self._audit(entry.workspace_id, actor_user_id, "time_entry.updated", "time_entry", entry.id, reason=reason, old_value=old_value, new_value=self._entry_snapshot(entry))
        return entry

    def delete_time_entry(self, entry_id: str, *, actor_user_id: str, reason: str) -> TimeEntry:
        entry = self._require_time_entry(entry_id)
        self._require_user(entry.workspace_id, actor_user_id)
        self._ensure_entry_editable(entry, reason=reason)
        old_value = self._entry_snapshot(entry)
        entry.deleted_at = datetime.now(UTC)
        self._audit(entry.workspace_id, actor_user_id, "time_entry.deleted", "time_entry", entry.id, reason=reason, old_value=old_value, new_value=self._entry_snapshot(entry))
        return entry

    def split_time_entry(
        self,
        entry_id: str,
        *,
        actor_user_id: str,
        split_at: datetime,
        second_description: str | None = None,
        second_project_id: str | None = None,
        second_task_id: str | None = None,
        reason: str,
    ) -> tuple[TimeEntry, TimeEntry]:
        entry = self._require_time_entry(entry_id)
        self._require_user(entry.workspace_id, actor_user_id)
        self._ensure_entry_editable(entry, reason=reason)
        self._require_aware_datetime(split_at, "split_at")
        if entry.end_at is None:
            raise ValueError("Only completed entries can be split")
        if not entry.start_at < split_at < entry.end_at:
            raise ValueError("Split time must be inside the entry range")
        old_value = self._entry_snapshot(entry)
        original_end = entry.end_at
        entry.end_at = split_at
        entry.duration_seconds = int((entry.end_at - entry.start_at).total_seconds())
        second = self.add_manual_entry(
            entry.workspace_id,
            entry.user_id,
            actor_user_id=actor_user_id,
            description=second_description or entry.description,
            start_at=split_at,
            end_at=original_end,
            project_id=second_project_id if second_project_id is not None else entry.project_id,
            task_id=second_task_id if second_task_id is not None else entry.task_id,
            is_billable=entry.is_billable,
        )
        self._audit(
            entry.workspace_id,
            actor_user_id,
            "time_entry.split",
            "time_entry",
            entry.id,
            reason=reason,
            old_value=old_value,
            new_value={"first": self._entry_snapshot(entry), "second": self._entry_snapshot(second)},
        )
        return entry, second

    def submit_timesheet(self, workspace_id: str, user_id: str, *, period_start: date, actor_user_id: str | None = None) -> TimesheetPeriod:
        actor = actor_user_id or user_id
        self._require_user(workspace_id, user_id)
        self._require_user(workspace_id, actor)
        period = self._get_or_create_period(workspace_id, user_id, period_start)
        if period.status not in {TimesheetStatus.DRAFT, TimesheetStatus.REJECTED, TimesheetStatus.WITHDRAWN}:
            raise ValueError("Only draft, rejected, or withdrawn timesheets can be submitted")
        old_value = self._period_snapshot(period)
        period.status = TimesheetStatus.SUBMITTED
        period.submitted_at = datetime.now(UTC)
        self._set_entry_status_for_period(period, ApprovalStatus.SUBMITTED)
        self._audit(workspace_id, actor, "timesheet.submitted", "timesheet_period", period.id, old_value=old_value, new_value=self._period_snapshot(period))
        return period

    def approve_timesheet(self, period_id: str, *, actor_user_id: str, reason: str | None = None) -> TimesheetPeriod:
        period = self._require_period(period_id)
        self._require_user(period.workspace_id, actor_user_id)
        if period.status != TimesheetStatus.SUBMITTED:
            raise ValueError("Only submitted timesheets can be approved")
        old_value = self._period_snapshot(period)
        period.status = TimesheetStatus.APPROVED
        period.decided_at = datetime.now(UTC)
        period.decided_by_user_id = actor_user_id
        period.decision_reason = reason
        self._set_entry_status_for_period(period, ApprovalStatus.APPROVED)
        self._audit(period.workspace_id, actor_user_id, "timesheet.approved", "timesheet_period", period.id, reason=reason, old_value=old_value, new_value=self._period_snapshot(period))
        return period

    def reject_timesheet(self, period_id: str, *, actor_user_id: str, reason: str) -> TimesheetPeriod:
        period = self._require_period(period_id)
        self._require_user(period.workspace_id, actor_user_id)
        if period.status != TimesheetStatus.SUBMITTED:
            raise ValueError("Only submitted timesheets can be rejected")
        old_value = self._period_snapshot(period)
        period.status = TimesheetStatus.REJECTED
        period.decided_at = datetime.now(UTC)
        period.decided_by_user_id = actor_user_id
        period.decision_reason = reason
        self._set_entry_status_for_period(period, ApprovalStatus.REJECTED)
        self._audit(period.workspace_id, actor_user_id, "timesheet.rejected", "timesheet_period", period.id, reason=reason, old_value=old_value, new_value=self._period_snapshot(period))
        return period

    def lock_timesheet(self, period_id: str, *, actor_user_id: str, reason: str) -> TimesheetPeriod:
        period = self._require_period(period_id)
        self._require_user(period.workspace_id, actor_user_id)
        old_value = self._period_snapshot(period)
        period.status = TimesheetStatus.LOCKED
        period.locked_at = datetime.now(UTC)
        self._set_entry_status_for_period(period, ApprovalStatus.LOCKED)
        for entry in self._entries_for_period(period):
            entry.locked_at = period.locked_at
        self._audit(period.workspace_id, actor_user_id, "timesheet.locked", "timesheet_period", period.id, reason=reason, old_value=old_value, new_value=self._period_snapshot(period))
        return period

    def weekly_summary(self, workspace_id: str, week_start: date) -> dict[str, int]:
        return {user_id: summary.total_seconds for user_id, summary in self.weekly_report(workspace_id, week_start).items()}

    def weekly_report(self, workspace_id: str, week_start: date) -> dict[str, WeeklyUserSummary]:
        self._require_workspace(workspace_id)
        start = datetime.combine(week_start, time.min, tzinfo=UTC)
        end = start + timedelta(days=7)
        totals: dict[str, dict[str, Decimal | int]] = defaultdict(lambda: {"total_seconds": 0, "billable_seconds": 0, "revenue": Decimal("0"), "labor_cost": Decimal("0")})
        for entry in self._completed_entries(workspace_id):
            if start <= entry.start_at < end:
                bucket = totals[entry.user_id]
                bucket["total_seconds"] += entry.duration_seconds
                bucket["labor_cost"] += self._entry_labor_cost(entry)
                if entry.is_billable:
                    bucket["billable_seconds"] += entry.duration_seconds
                    bucket["revenue"] += self._entry_revenue(entry)
        return {
            user_id: WeeklyUserSummary(
                user_id=user_id,
                total_seconds=int(values["total_seconds"]),
                billable_seconds=int(values["billable_seconds"]),
                revenue=values["revenue"].quantize(Decimal("0.01")),
                labor_cost=values["labor_cost"].quantize(Decimal("0.01")),
            )
            for user_id, values in totals.items()
        }

    def monthly_income(self, workspace_id: str, year: int, month: int) -> Decimal:
        return self.monthly_income_summary(workspace_id, year, month).revenue

    def monthly_income_summary(self, workspace_id: str, year: int, month: int) -> MonthlyIncomeSummary:
        self._require_workspace(workspace_id)
        billable_seconds = 0
        revenue = Decimal("0")
        labor_cost = Decimal("0")
        for entry in self._completed_entries(workspace_id):
            if entry.start_at.year == year and entry.start_at.month == month:
                labor_cost += self._entry_labor_cost(entry)
                if entry.is_billable:
                    billable_seconds += entry.duration_seconds
                    revenue += self._entry_revenue(entry)
        revenue = revenue.quantize(Decimal("0.01"))
        labor_cost = labor_cost.quantize(Decimal("0.01"))
        return MonthlyIncomeSummary(
            workspace_id=workspace_id,
            year=year,
            month=month,
            billable_seconds=billable_seconds,
            revenue=revenue,
            labor_cost=labor_cost,
            profit=(revenue - labor_cost).quantize(Decimal("0.01")),
        )

    def export_csv(self, workspace_id: str) -> str:
        self._require_workspace(workspace_id)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["entry_id", "user", "project", "task", "description", "start_at", "end_at", "duration_hours", "billable", "billable_rate", "approval_status"])
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
                entry.approval_status.value,
            ])
        return buffer.getvalue()

    def _completed_entries(self, workspace_id: str) -> list[TimeEntry]:
        return [entry for entry in self.time_entries.values() if entry.workspace_id == workspace_id and not entry.is_running and entry.deleted_at is None]

    def _entries_for_period(self, period: TimesheetPeriod) -> list[TimeEntry]:
        start = datetime.combine(period.period_start, time.min, tzinfo=UTC)
        end = datetime.combine(period.period_end + timedelta(days=1), time.min, tzinfo=UTC)
        return [entry for entry in self._completed_entries(period.workspace_id) if entry.user_id == period.user_id and start <= entry.start_at < end]

    def _set_entry_status_for_period(self, period: TimesheetPeriod, status: ApprovalStatus) -> None:
        for entry in self._entries_for_period(period):
            entry.approval_status = status

    def _get_or_create_period(self, workspace_id: str, user_id: str, period_start: date) -> TimesheetPeriod:
        period_end = period_start + timedelta(days=6)
        for period in self.timesheet_periods.values():
            if period.workspace_id == workspace_id and period.user_id == user_id and period.period_start == period_start:
                return period
        period = TimesheetPeriod(workspace_id=workspace_id, user_id=user_id, period_start=period_start, period_end=period_end)
        self.timesheet_periods[period.id] = period
        return period

    def _resolve_billable_rate(self, workspace_id: str, project_id: str | None, task_id: str | None) -> Decimal:
        if task_id:
            task = self._require_task(workspace_id, task_id, project_id=project_id)
            if task.billable_rate is not None:
                return task.billable_rate
        if project_id:
            project = self._require_project(workspace_id, project_id)
            if project.billable_rate is not None:
                return project.billable_rate
        return self.workspaces[workspace_id].default_billable_rate

    def _validate_entry_context(self, workspace_id: str, user_id: str, actor_user_id: str, project_id: object | None, task_id: object | None) -> None:
        self._require_workspace(workspace_id)
        self._require_user(workspace_id, user_id)
        self._require_user(workspace_id, actor_user_id)
        if project_id is not None and not isinstance(project_id, str):
            raise ValueError("project_id must be a string or None")
        if task_id is not None and not isinstance(task_id, str):
            raise ValueError("task_id must be a string or None")
        if project_id:
            self._require_project(workspace_id, project_id)
        if task_id:
            self._require_task(workspace_id, task_id, project_id=project_id)

    def _ensure_no_running_entry(self, workspace_id: str, user_id: str) -> None:
        if any(entry.workspace_id == workspace_id and entry.user_id == user_id and entry.is_running for entry in self.time_entries.values()):
            raise ValueError("User already has a running timer")

    def _ensure_entry_editable(self, entry: TimeEntry, *, reason: str) -> None:
        if not reason.strip():
            raise ValueError("A reason is required for auditable time entry changes")
        if entry.approval_status in LOCKED_ENTRY_STATUSES or entry.locked_at is not None:
            raise ValueError("Submitted, approved, or locked time entries cannot be edited")

    def _require_workspace(self, workspace_id: str) -> Workspace:
        if workspace_id not in self.workspaces:
            raise KeyError("Unknown workspace")
        return self.workspaces[workspace_id]

    def _require_user(self, workspace_id: str, user_id: str) -> User:
        if user_id not in self.users or self.users[user_id].workspace_id != workspace_id:
            raise KeyError("Unknown user for workspace")
        return self.users[user_id]

    def _require_client(self, workspace_id: str, client_id: str) -> Client:
        if client_id not in self.clients or self.clients[client_id].workspace_id != workspace_id:
            raise KeyError("Unknown client for workspace")
        return self.clients[client_id]

    def _require_project(self, workspace_id: str, project_id: str) -> Project:
        if project_id not in self.projects or self.projects[project_id].workspace_id != workspace_id:
            raise KeyError("Unknown project for workspace")
        return self.projects[project_id]

    def _require_task(self, workspace_id: str, task_id: str, *, project_id: str | None = None) -> Task:
        if task_id not in self.tasks or self.tasks[task_id].workspace_id != workspace_id:
            raise KeyError("Unknown task for workspace")
        task = self.tasks[task_id]
        if project_id is not None and task.project_id != project_id:
            raise ValueError("Task does not belong to the selected project")
        return task

    def _require_time_entry(self, entry_id: str) -> TimeEntry:
        if entry_id not in self.time_entries or self.time_entries[entry_id].deleted_at is not None:
            raise KeyError("Unknown time entry")
        return self.time_entries[entry_id]

    def _require_period(self, period_id: str) -> TimesheetPeriod:
        if period_id not in self.timesheet_periods:
            raise KeyError("Unknown timesheet period")
        return self.timesheet_periods[period_id]

    def _require_aware_datetime(self, value: object, field_name: str) -> None:
        if not isinstance(value, datetime):
            raise ValueError(f"{field_name} must be a datetime")
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError(f"{field_name} must be timezone-aware")

    def _entry_revenue(self, entry: TimeEntry) -> Decimal:
        return Decimal(entry.duration_seconds) / Decimal(3600) * entry.billable_rate_snapshot

    def _entry_labor_cost(self, entry: TimeEntry) -> Decimal:
        return Decimal(entry.duration_seconds) / Decimal(3600) * entry.cost_rate_snapshot

    def _entry_snapshot(self, entry: TimeEntry) -> dict[str, object]:
        return {
            "id": entry.id,
            "workspace_id": entry.workspace_id,
            "user_id": entry.user_id,
            "created_by_user_id": entry.created_by_user_id,
            "description": entry.description,
            "start_at": entry.start_at.isoformat(),
            "end_at": entry.end_at.isoformat() if entry.end_at else None,
            "duration_seconds": entry.duration_seconds,
            "project_id": entry.project_id,
            "task_id": entry.task_id,
            "is_billable": entry.is_billable,
            "billable_rate_snapshot": str(entry.billable_rate_snapshot),
            "cost_rate_snapshot": str(entry.cost_rate_snapshot),
            "source": entry.source.value,
            "approval_status": entry.approval_status.value,
            "deleted_at": entry.deleted_at.isoformat() if entry.deleted_at else None,
            "locked_at": entry.locked_at.isoformat() if entry.locked_at else None,
        }

    def _period_snapshot(self, period: TimesheetPeriod) -> dict[str, object]:
        return {
            "id": period.id,
            "workspace_id": period.workspace_id,
            "user_id": period.user_id,
            "period_start": period.period_start.isoformat(),
            "period_end": period.period_end.isoformat(),
            "status": period.status.value,
            "submitted_at": period.submitted_at.isoformat() if period.submitted_at else None,
            "decided_at": period.decided_at.isoformat() if period.decided_at else None,
            "decided_by_user_id": period.decided_by_user_id,
            "decision_reason": period.decision_reason,
            "locked_at": period.locked_at.isoformat() if period.locked_at else None,
        }

    def _audit(
        self,
        workspace_id: str,
        actor_user_id: str,
        action: str,
        target_type: str,
        target_id: str,
        *,
        reason: str | None = None,
        old_value: dict[str, object] | None = None,
        new_value: dict[str, object] | None = None,
        metadata: dict[str, object] | None = None,
    ) -> None:
        self.audit_logs.append(
            AuditLog(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                reason=reason,
                old_value=old_value or {},
                new_value=new_value or {},
                metadata=metadata or {},
            )
        )
