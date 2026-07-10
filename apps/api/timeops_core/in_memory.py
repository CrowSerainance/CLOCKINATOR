from __future__ import annotations

from dataclasses import dataclass, field

from .models import AuditLog, Client, Project, Tag, Task, TimeEntry, TimesheetPeriod, User, Workspace


@dataclass
class InMemoryTimeOpsStore:
    """In-memory store for tests, demos, and the first self-hosted prototype."""

    workspaces: dict[str, Workspace] = field(default_factory=dict)
    users: dict[str, User] = field(default_factory=dict)
    clients: dict[str, Client] = field(default_factory=dict)
    projects: dict[str, Project] = field(default_factory=dict)
    tasks: dict[str, Task] = field(default_factory=dict)
    tags: dict[str, Tag] = field(default_factory=dict)
    time_entries: dict[str, TimeEntry] = field(default_factory=dict)
    timesheet_periods: dict[str, TimesheetPeriod] = field(default_factory=dict)
    audit_logs: list[AuditLog] = field(default_factory=list)
