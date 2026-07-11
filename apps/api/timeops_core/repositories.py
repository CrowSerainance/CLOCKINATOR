from __future__ import annotations

from typing import Protocol

from .models import AuditLog, Client, Project, Tag, Task, TimeEntry, TimesheetPeriod, User, Workspace


class TimeOpsStore(Protocol):
    """Mutable storage boundary used by the domain service.

    The first implementation is in-memory, but this protocol keeps the service from
    being coupled to where records are stored. A PostgreSQL implementation can
    satisfy this same shape while the business methods stay stable.
    """

    workspaces: dict[str, Workspace]
    users: dict[str, User]
    clients: dict[str, Client]
    projects: dict[str, Project]
    tasks: dict[str, Task]
    tags: dict[str, Tag]
    time_entries: dict[str, TimeEntry]
    timesheet_periods: dict[str, TimesheetPeriod]
    audit_logs: list[AuditLog]
    favorite_projects_by_user: dict[str, set[str]]
