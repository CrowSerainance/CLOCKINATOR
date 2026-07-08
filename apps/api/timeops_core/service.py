from __future__ import annotations

import csv
import io
from collections import defaultdict
<<<<<<< codex/create-clockify-style-self-hosted-time-system
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from .models import (
    ApprovalStatus,
    AuditLog,
    Client,
    CalendarDay,
    CalendarEvent,
    CalendarWeek,
    MonthlyIncomeSummary,
    Project,
    ProjectAccess,
    ProjectStatus,
    ReportGroupBy,
    ReportQuery,
    ReportSummaryRow,
    Tag,
    Task,
    TimeEntry,
    TimeEntrySource,
    TimeTrackerDay,
    TimeTrackerEntry,
    TimeTrackerWeek,
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
=======
from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from .models import AuditLog, Client, Project, ProjectAccess, ProjectStatus, ProjectSummary, Tag, Task, TimeEntry, TimeEntrySource, User, Workspace


class TimeOpsService:
    """In-memory Phase 1 application service with auditable time-entry operations."""

    def __init__(self) -> None:
>>>>>>> main
        self.workspaces: dict[str, Workspace] = {}
        self.users: dict[str, User] = {}
        self.clients: dict[str, Client] = {}
        self.projects: dict[str, Project] = {}
        self.tasks: dict[str, Task] = {}
        self.tags: dict[str, Tag] = {}
        self.time_entries: dict[str, TimeEntry] = {}
<<<<<<< codex/create-clockify-style-self-hosted-time-system
        self.timesheet_periods: dict[str, TimesheetPeriod] = {}
        self.audit_logs: list[AuditLog] = []

    def create_workspace(self, name: str, *, default_billable_rate: Decimal = Decimal("0"), currency: str = "USD") -> Workspace:
        if self.single_workspace and self.workspaces:
            raise ValueError("This service is configured for a single self-hosted workspace")
=======
        self.audit_logs: list[AuditLog] = []

    def create_workspace(self, name: str, *, default_billable_rate: Decimal = Decimal("0"), currency: str = "USD") -> Workspace:
>>>>>>> main
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

<<<<<<< codex/create-clockify-style-self-hosted-time-system
    def add_project(
        self,
        workspace_id: str,
        name: str,
        *,
        client_id: str | None = None,
        billable_rate: Decimal | None = None,
        color: str = "#64748b",
        status: ProjectStatus = ProjectStatus.ACTIVE,
        access: ProjectAccess = ProjectAccess.PUBLIC,
        estimate_seconds: int | None = None,
    ) -> Project:
        self._require_workspace(workspace_id)
        if client_id is not None:
            self._require_client(workspace_id, client_id)
        if estimate_seconds is not None and estimate_seconds < 0:
            raise ValueError("Project estimate cannot be negative")
        project = Project(
            workspace_id=workspace_id,
            name=name,
            client_id=client_id,
            billable_rate=billable_rate,
            color=color,
            status=status,
            access=access,
            estimate_seconds=estimate_seconds,
        )
        self.projects[project.id] = project
        return project

    def add_task(self, workspace_id: str, project_id: str, name: str, *, billable_rate: Decimal | None = None) -> Task:
        self._require_workspace(workspace_id)
        self._require_project(workspace_id, project_id)
=======
    def add_project(self, workspace_id: str, name: str, *, client_id: str | None = None, billable_rate: Decimal | None = None, color: str | None = None, status: ProjectStatus = ProjectStatus.ACTIVE, estimated_hours: Decimal | None = None, access: ProjectAccess = ProjectAccess.PUBLIC) -> Project:
        self._require_workspace(workspace_id)
        project = Project(workspace_id=workspace_id, name=name, client_id=client_id, billable_rate=billable_rate, color=color, status=status, estimated_hours=estimated_hours, access=access)
        self.projects[project.id] = project
        return project

    def set_project_status(self, project_id: str, status: ProjectStatus, *, actor_user_id: str) -> Project:
        project = self.projects[project_id]
        updated = replace(project, status=status)
        self.projects[project_id] = updated
        self._audit(project.workspace_id, actor_user_id, "project.status_changed", "project", project_id, metadata={"status": status.value})
        return updated

    def set_project_favorite(self, project_id: str, is_favorite: bool) -> Project:
        project = self.projects[project_id]
        updated = replace(project, is_favorite=is_favorite)
        self.projects[project_id] = updated
        return updated

    def add_task(self, workspace_id: str, project_id: str, name: str, *, billable_rate: Decimal | None = None) -> Task:
        self._require_workspace(workspace_id)
        if project_id not in self.projects:
            raise KeyError("Unknown project")
>>>>>>> main
        task = Task(workspace_id=workspace_id, project_id=project_id, name=name, billable_rate=billable_rate)
        self.tasks[task.id] = task
        return task

<<<<<<< codex/create-clockify-style-self-hosted-time-system
    def add_tag(self, workspace_id: str, name: str, *, color: str = "#38bdf8") -> Tag:
=======
    def add_tag(self, workspace_id: str, name: str, *, color: str | None = None) -> Tag:
>>>>>>> main
        self._require_workspace(workspace_id)
        tag = Tag(workspace_id=workspace_id, name=name, color=color)
        self.tags[tag.id] = tag
        return tag

<<<<<<< codex/create-clockify-style-self-hosted-time-system
    def start_timer(
        self,
        workspace_id: str,
        user_id: str,
        *,
        actor_user_id: str | None = None,
        description: str = "",
        project_id: str | None = None,
        task_id: str | None = None,
        tag_ids: tuple[str, ...] = (),
        is_billable: bool = False,
        started_at: datetime | None = None,
    ) -> TimeEntry:
        actor = actor_user_id or user_id
        started = started_at or datetime.now(UTC)
        self._validate_entry_context(workspace_id, user_id, actor, project_id, task_id, tag_ids)
        self._require_aware_datetime(started, "started_at")
=======
    def start_timer(self, workspace_id: str, user_id: str, *, actor_user_id: str | None = None, description: str = "", project_id: str | None = None, task_id: str | None = None, is_billable: bool = False, tag_ids: list[str] | None = None, started_at: datetime | None = None) -> TimeEntry:
>>>>>>> main
        self._ensure_no_running_entry(workspace_id, user_id)
        entry = TimeEntry(
            workspace_id=workspace_id,
            user_id=user_id,
<<<<<<< codex/create-clockify-style-self-hosted-time-system
            created_by_user_id=actor,
            description=description,
            start_at=started,
            project_id=project_id,
            task_id=task_id,
            tag_ids=list(tag_ids),
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
        tag_ids: tuple[str, ...] = (),
        is_billable: bool = False,
    ) -> TimeEntry:
        actor = actor_user_id or user_id
        self._validate_entry_context(workspace_id, user_id, actor, project_id, task_id, tag_ids)
        self._require_aware_datetime(start_at, "start_at")
        self._require_aware_datetime(end_at, "end_at")
        if end_at <= start_at:
            raise ValueError("End time must be after start time")
=======
            created_by_user_id=actor_user_id or user_id,
            description=description,
            start_at=started_at or datetime.now(UTC),
            project_id=project_id,
            task_id=task_id,
            is_billable=is_billable,
            billable_rate_snapshot=self._resolve_billable_rate(workspace_id, project_id, task_id) if is_billable else Decimal("0"),
            cost_rate_snapshot=self.users[user_id].default_cost_rate,
            tag_ids=self._validate_tags(workspace_id, tag_ids),
        )
        self.time_entries[entry.id] = entry
        self._audit(workspace_id, entry.created_by_user_id, "time_entry.started", "time_entry", entry.id)
        return entry

    def stop_timer(self, entry_id: str, *, actor_user_id: str, stopped_at: datetime | None = None) -> TimeEntry:
        entry = self.time_entries[entry_id]
        entry.stop(stopped_at or datetime.now(UTC))
        self._audit(entry.workspace_id, actor_user_id, "time_entry.stopped", "time_entry", entry.id, metadata={"duration_seconds": entry.duration_seconds})
        return entry

    def add_manual_entry(self, workspace_id: str, user_id: str, *, actor_user_id: str | None = None, description: str, start_at: datetime, end_at: datetime, project_id: str | None = None, task_id: str | None = None, is_billable: bool = False, tag_ids: list[str] | None = None) -> TimeEntry:
        if end_at <= start_at:
            raise ValueError("End time must be after start time")
        actor = actor_user_id or user_id
>>>>>>> main
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
<<<<<<< codex/create-clockify-style-self-hosted-time-system
            tag_ids=list(tag_ids),
=======
>>>>>>> main
            is_billable=is_billable,
            billable_rate_snapshot=self._resolve_billable_rate(workspace_id, project_id, task_id) if is_billable else Decimal("0"),
            cost_rate_snapshot=self.users[user_id].default_cost_rate,
            source=source,
<<<<<<< codex/create-clockify-style-self-hosted-time-system
        )
        self.time_entries[entry.id] = entry
        self._audit(workspace_id, actor, "time_entry.created", "time_entry", entry.id, new_value=self._entry_snapshot(entry))
        return entry

    def update_time_entry(self, entry_id: str, *, actor_user_id: str, reason: str, **changes: object) -> TimeEntry:
        entry = self._require_time_entry(entry_id)
        self._require_user(entry.workspace_id, actor_user_id)
        self._ensure_entry_editable(entry, reason=reason)
        allowed_fields = {"description", "project_id", "task_id", "tag_ids", "is_billable", "start_at", "end_at"}
        unknown_fields = set(changes) - allowed_fields
        if unknown_fields:
            raise ValueError(f"Unsupported time entry fields: {', '.join(sorted(unknown_fields))}")
        old_value = self._entry_snapshot(entry)
        project_id = changes.get("project_id", entry.project_id)
        task_id = changes.get("task_id", entry.task_id)
        tag_ids = tuple(changes.get("tag_ids", entry.tag_ids))
        self._validate_entry_context(entry.workspace_id, entry.user_id, entry.created_by_user_id, project_id, task_id, tag_ids)
        if "start_at" in changes:
            self._require_aware_datetime(changes["start_at"], "start_at")
        if "end_at" in changes and changes["end_at"] is not None:
            self._require_aware_datetime(changes["end_at"], "end_at")
        for field_name, value in changes.items():
            if field_name == "tag_ids":
                entry.tag_ids = list(value)
            else:
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
            tag_ids=tuple(entry.tag_ids),
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

    def assign_tags_to_entry(self, entry_id: str, *, actor_user_id: str, tag_ids: tuple[str, ...], reason: str) -> TimeEntry:
        return self.update_time_entry(entry_id, actor_user_id=actor_user_id, reason=reason, tag_ids=list(tag_ids))

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

    def report_summary(self, query: ReportQuery) -> tuple[ReportSummaryRow, ...]:
        self._validate_report_query(query)
        buckets: dict[str, dict[str, Decimal | int | str]] = {}
        for entry in self._entries_for_query(query):
            for group_key, group_label in self._group_keys_for_entry(entry, query.group_by):
                bucket = buckets.setdefault(group_key, {"label": group_label, "total_seconds": 0, "billable_seconds": 0, "revenue": Decimal("0"), "labor_cost": Decimal("0")})
                bucket["total_seconds"] += self._effective_duration_seconds(entry)
                bucket["labor_cost"] += self._entry_labor_cost_for_seconds(entry, self._effective_duration_seconds(entry))
                if entry.is_billable:
                    bucket["billable_seconds"] += self._effective_duration_seconds(entry)
                    bucket["revenue"] += self._entry_revenue_for_seconds(entry, self._effective_duration_seconds(entry))
        return tuple(
            ReportSummaryRow(
                group_key=group_key,
                group_label=str(values["label"]),
                total_seconds=int(values["total_seconds"]),
                billable_seconds=int(values["billable_seconds"]),
                revenue=values["revenue"].quantize(Decimal("0.01")),
                labor_cost=values["labor_cost"].quantize(Decimal("0.01")),
            )
            for group_key, values in sorted(buckets.items(), key=lambda item: item[1]["label"])
        )

    def time_tracker_week(self, workspace_id: str, user_id: str, week_start: date) -> TimeTrackerWeek:
        self._require_user(workspace_id, user_id)
        week_end = week_start + timedelta(days=6)
        days = []
        total_seconds = 0
        for offset in range(7):
            current_day = week_start + timedelta(days=offset)
            day_start = datetime.combine(current_day, time.min, tzinfo=UTC)
            day_end = day_start + timedelta(days=1)
            entries = tuple(
                self._tracker_entry(entry)
                for entry in sorted(self.time_entries.values(), key=lambda item: item.start_at)
                if entry.workspace_id == workspace_id
                and entry.user_id == user_id
                and entry.deleted_at is None
                and day_start <= entry.start_at < day_end
            )
            day_total = sum(entry.duration_seconds for entry in entries)
            total_seconds += day_total
            days.append(TimeTrackerDay(day=current_day, total_seconds=day_total, entries=entries))
        return TimeTrackerWeek(workspace_id=workspace_id, user_id=user_id, week_start=week_start, week_end=week_end, total_seconds=total_seconds, days=tuple(days))

    def calendar_week(self, workspace_id: str, week_start: date, *, user_ids: tuple[str, ...] = ()) -> CalendarWeek:
        self._require_workspace(workspace_id)
        selected_user_ids = user_ids or tuple(user.id for user in self.users.values() if user.workspace_id == workspace_id)
        for user_id in selected_user_ids:
            self._require_user(workspace_id, user_id)
        week_end = week_start + timedelta(days=6)
        days = []
        total_seconds = 0
        for offset in range(7):
            current_day = week_start + timedelta(days=offset)
            day_start = datetime.combine(current_day, time.min, tzinfo=UTC)
            day_end = day_start + timedelta(days=1)
            events = tuple(
                self._calendar_event(entry)
                for entry in sorted(self.time_entries.values(), key=lambda item: item.start_at)
                if entry.workspace_id == workspace_id
                and entry.user_id in selected_user_ids
                and entry.deleted_at is None
                and day_start <= entry.start_at < day_end
            )
            day_total = sum(event.duration_seconds for event in events)
            total_seconds += day_total
            days.append(CalendarDay(day=current_day, total_seconds=day_total, events=events))
        return CalendarWeek(workspace_id=workspace_id, week_start=week_start, week_end=week_end, user_ids=tuple(selected_user_ids), total_seconds=total_seconds, days=tuple(days))

    def export_csv(self, workspace_id: str) -> str:
        self._require_workspace(workspace_id)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["entry_id", "user", "project", "task", "description", "start_at", "end_at", "duration_hours", "billable", "billable_rate", "approval_status"])
=======
            tag_ids=self._validate_tags(workspace_id, tag_ids),
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

    def project_summaries(self, workspace_id: str) -> dict[str, ProjectSummary]:
        tracked: dict[str, int] = defaultdict(int)
        billable_seconds: dict[str, int] = defaultdict(int)
        billable_amount: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for entry in self._completed_entries(workspace_id):
            if not entry.project_id:
                continue
            tracked[entry.project_id] += entry.duration_seconds
            if entry.is_billable:
                billable_seconds[entry.project_id] += entry.duration_seconds
                billable_amount[entry.project_id] += Decimal(entry.duration_seconds) / Decimal(3600) * entry.billable_rate_snapshot
        summaries: dict[str, ProjectSummary] = {}
        for project in self.projects.values():
            if project.workspace_id != workspace_id:
                continue
            seconds = tracked[project.id]
            estimated = project.estimated_hours
            progress = (Decimal(seconds) / Decimal(3600) / estimated).quantize(Decimal("0.0001")) if estimated else None
            summaries[project.id] = ProjectSummary(
                project_id=project.id,
                tracked_seconds=seconds,
                billable_seconds=billable_seconds[project.id],
                billable_amount=billable_amount[project.id].quantize(Decimal("0.01")),
                estimated_hours=estimated,
                progress=progress,
            )
        return summaries

    def export_csv(self, workspace_id: str) -> str:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["entry_id", "user", "project", "task", "tags", "description", "start_at", "end_at", "duration_hours", "billable", "billable_rate"])
>>>>>>> main
        for entry in self._completed_entries(workspace_id):
            writer.writerow([
                entry.id,
                self.users[entry.user_id].email,
                self.projects[entry.project_id].name if entry.project_id else "",
                self.tasks[entry.task_id].name if entry.task_id else "",
<<<<<<< codex/create-clockify-style-self-hosted-time-system
=======
                ", ".join(self.tags[tag_id].name for tag_id in entry.tag_ids),
>>>>>>> main
                entry.description,
                entry.start_at.isoformat(),
                entry.end_at.isoformat() if entry.end_at else "",
                f"{entry.duration_seconds / 3600:.2f}",
                str(entry.is_billable).lower(),
                str(entry.billable_rate_snapshot),
<<<<<<< codex/create-clockify-style-self-hosted-time-system
                entry.approval_status.value,
=======
>>>>>>> main
            ])
        return buffer.getvalue()

    def _completed_entries(self, workspace_id: str) -> list[TimeEntry]:
        return [entry for entry in self.time_entries.values() if entry.workspace_id == workspace_id and not entry.is_running and entry.deleted_at is None]

<<<<<<< codex/create-clockify-style-self-hosted-time-system
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

    def _validate_entry_context(self, workspace_id: str, user_id: str, actor_user_id: str, project_id: object | None, task_id: object | None, tag_ids: tuple[str, ...] = ()) -> None:
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
        self._validate_tag_ids(workspace_id, tag_ids)
=======
    def _resolve_billable_rate(self, workspace_id: str, project_id: str | None, task_id: str | None) -> Decimal:
        if task_id and self.tasks[task_id].billable_rate is not None:
            return self.tasks[task_id].billable_rate or Decimal("0")
        if project_id and self.projects[project_id].billable_rate is not None:
            return self.projects[project_id].billable_rate or Decimal("0")
        return self.workspaces[workspace_id].default_billable_rate

    def _validate_tags(self, workspace_id: str, tag_ids: list[str] | None) -> list[str]:
        if not tag_ids:
            return []
        for tag_id in tag_ids:
            tag = self.tags.get(tag_id)
            if tag is None or tag.workspace_id != workspace_id:
                raise KeyError("Unknown tag")
        return list(tag_ids)
>>>>>>> main

    def _ensure_no_running_entry(self, workspace_id: str, user_id: str) -> None:
        if any(entry.workspace_id == workspace_id and entry.user_id == user_id and entry.is_running for entry in self.time_entries.values()):
            raise ValueError("User already has a running timer")

<<<<<<< codex/create-clockify-style-self-hosted-time-system
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
            "tag_ids": list(entry.tag_ids),
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

    def _require_tag(self, workspace_id: str, tag_id: str) -> Tag:
        if tag_id not in self.tags or self.tags[tag_id].workspace_id != workspace_id:
            raise KeyError("Unknown tag for workspace")
        return self.tags[tag_id]

    def _validate_tag_ids(self, workspace_id: str, tag_ids: tuple[str, ...]) -> None:
        for tag_id in tag_ids:
            self._require_tag(workspace_id, tag_id)

    def _validate_report_query(self, query: ReportQuery) -> None:
        self._require_workspace(query.workspace_id)
        self._require_aware_datetime(query.start_at, "start_at")
        self._require_aware_datetime(query.end_at, "end_at")
        if query.end_at <= query.start_at:
            raise ValueError("Report end time must be after start time")
        for user_id in query.user_ids:
            self._require_user(query.workspace_id, user_id)
        for client_id in query.client_ids:
            self._require_client(query.workspace_id, client_id)
        for project_id in query.project_ids:
            self._require_project(query.workspace_id, project_id)
        for task_id in query.task_ids:
            self._require_task(query.workspace_id, task_id)
        self._validate_tag_ids(query.workspace_id, query.tag_ids)

    def _entries_for_query(self, query: ReportQuery) -> list[TimeEntry]:
        entries = []
        description_filter = query.description_contains.casefold() if query.description_contains else None
        for entry in self.time_entries.values():
            if entry.workspace_id != query.workspace_id or entry.deleted_at is not None:
                continue
            if entry.is_running and not query.include_running:
                continue
            if not (query.start_at <= entry.start_at < query.end_at):
                continue
            if query.user_ids and entry.user_id not in query.user_ids:
                continue
            if query.project_ids and entry.project_id not in query.project_ids:
                continue
            if query.task_ids and entry.task_id not in query.task_ids:
                continue
            if query.client_ids:
                project = self.projects.get(entry.project_id) if entry.project_id else None
                if project is None or project.client_id not in query.client_ids:
                    continue
            if query.tag_ids and not set(query.tag_ids).issubset(set(entry.tag_ids)):
                continue
            if description_filter and description_filter not in entry.description.casefold():
                continue
            entries.append(entry)
        return entries

    def _group_keys_for_entry(self, entry: TimeEntry, group_by: ReportGroupBy) -> tuple[tuple[str, str], ...]:
        if group_by == ReportGroupBy.USER:
            user = self.users[entry.user_id]
            return ((user.id, user.name),)
        if group_by == ReportGroupBy.CLIENT:
            project = self.projects.get(entry.project_id) if entry.project_id else None
            client = self.clients.get(project.client_id) if project and project.client_id else None
            return ((client.id, client.name),) if client else (("uncategorized", "No client"),)
        if group_by == ReportGroupBy.PROJECT:
            project = self.projects.get(entry.project_id) if entry.project_id else None
            return ((project.id, project.name),) if project else (("uncategorized", "No project"),)
        if group_by == ReportGroupBy.TASK:
            task = self.tasks.get(entry.task_id) if entry.task_id else None
            return ((task.id, task.name),) if task else (("uncategorized", "No task"),)
        if group_by == ReportGroupBy.TAG:
            if not entry.tag_ids:
                return (("untagged", "No tag"),)
            return tuple((tag.id, tag.name) for tag in (self.tags[tag_id] for tag_id in entry.tag_ids))
        if group_by == ReportGroupBy.DESCRIPTION:
            return ((entry.description or "No description", entry.description or "No description"),)
        if group_by == ReportGroupBy.DAY:
            day = entry.start_at.date().isoformat()
            return ((day, day),)
        raise ValueError(f"Unsupported report grouping: {group_by}")

    def _effective_duration_seconds(self, entry: TimeEntry) -> int:
        if entry.is_running:
            return int((datetime.now(UTC) - entry.start_at).total_seconds())
        return entry.duration_seconds

    def _entry_revenue_for_seconds(self, entry: TimeEntry, duration_seconds: int) -> Decimal:
        return Decimal(duration_seconds) / Decimal(3600) * entry.billable_rate_snapshot

    def _entry_labor_cost_for_seconds(self, entry: TimeEntry, duration_seconds: int) -> Decimal:
        return Decimal(duration_seconds) / Decimal(3600) * entry.cost_rate_snapshot

    def _tracker_entry(self, entry: TimeEntry) -> TimeTrackerEntry:
        project = self.projects.get(entry.project_id) if entry.project_id else None
        client = self.clients.get(project.client_id) if project and project.client_id else None
        task = self.tasks.get(entry.task_id) if entry.task_id else None
        return TimeTrackerEntry(
            id=entry.id,
            description=entry.description,
            project_id=entry.project_id,
            project_name=project.name if project else None,
            project_color=project.color if project else None,
            client_name=client.name if client else None,
            task_id=entry.task_id,
            task_name=task.name if task else None,
            tags=tuple(self.tags[tag_id] for tag_id in entry.tag_ids),
            start_at=entry.start_at,
            end_at=entry.end_at,
            duration_seconds=self._effective_duration_seconds(entry),
            is_running=entry.is_running,
            is_billable=entry.is_billable,
        )

    def _calendar_event(self, entry: TimeEntry) -> CalendarEvent:
        project = self.projects.get(entry.project_id) if entry.project_id else None
        client = self.clients.get(project.client_id) if project and project.client_id else None
        task = self.tasks.get(entry.task_id) if entry.task_id else None
        return CalendarEvent(
            id=entry.id,
            user_id=entry.user_id,
            title=entry.description or (project.name if project else "Untitled"),
            project_name=project.name if project else None,
            client_name=client.name if client else None,
            task_name=task.name if task else None,
            project_color=project.color if project else None,
            tag_names=tuple(self.tags[tag_id].name for tag_id in entry.tag_ids),
            start_at=entry.start_at,
            end_at=entry.end_at,
            duration_seconds=self._effective_duration_seconds(entry),
        )

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
=======
    def _require_workspace(self, workspace_id: str) -> None:
        if workspace_id not in self.workspaces:
            raise KeyError("Unknown workspace")

    def _audit(self, workspace_id: str, actor_user_id: str, action: str, target_type: str, target_id: str, *, metadata: dict[str, object] | None = None) -> None:
        self.audit_logs.append(AuditLog(workspace_id=workspace_id, actor_user_id=actor_user_id, action=action, target_type=target_type, target_id=target_id, metadata=metadata or {}))
>>>>>>> main
