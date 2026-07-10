from __future__ import annotations

from dataclasses import asdict, is_dataclass

from fastapi import FastAPI

from apps.api.timeops_api.schemas import (
    CreateClientRequest,
    CreateProjectRequest,
    CreateTagRequest,
    CreateUserRequest,
    CreateWorkspaceRequest,
    ManualEntryRequest,
    ReportSummaryRequest,
    StartTimerRequest,
    StopTimerRequest,
)
from apps.api.timeops_core.models import ReportQuery
from apps.api.timeops_core.service import TimeOpsService


def serialize(value: object) -> object:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, tuple):
        return [serialize(item) for item in value]
    if isinstance(value, list):
        return [serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    return value


def create_app(service: TimeOpsService | None = None) -> FastAPI:
    app = FastAPI(title="Clockinator API", version="0.1.0")
    timeops = service or TimeOpsService()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/workspaces")
    def create_workspace(payload: CreateWorkspaceRequest) -> object:
        return serialize(timeops.create_workspace(payload.name, default_billable_rate=payload.default_billable_rate, currency=payload.currency))

    @app.post("/users")
    def create_user(payload: CreateUserRequest) -> object:
        return serialize(timeops.add_user(payload.workspace_id, payload.name, payload.email, default_cost_rate=payload.default_cost_rate))

    @app.post("/clients")
    def create_client(payload: CreateClientRequest) -> object:
        return serialize(timeops.add_client(payload.workspace_id, payload.name))

    @app.get("/projects")
    def list_projects(workspace_id: str) -> object:
        return serialize([project for project in timeops.projects.values() if project.workspace_id == workspace_id])

    @app.post("/projects")
    def create_project(payload: CreateProjectRequest) -> object:
        return serialize(
            timeops.add_project(
                payload.workspace_id,
                payload.name,
                client_id=payload.client_id,
                billable_rate=payload.billable_rate,
                color=payload.color,
                status=payload.status,
                access=payload.access,
                estimate_seconds=payload.estimate_seconds,
            )
        )

    @app.get("/tags")
    def list_tags(workspace_id: str) -> object:
        return serialize([tag for tag in timeops.tags.values() if tag.workspace_id == workspace_id])

    @app.post("/tags")
    def create_tag(payload: CreateTagRequest) -> object:
        return serialize(timeops.add_tag(payload.workspace_id, payload.name, color=payload.color))

    @app.post("/time-entries/start")
    def start_timer(payload: StartTimerRequest) -> object:
        return serialize(
            timeops.start_timer(
                payload.workspace_id,
                payload.user_id,
                actor_user_id=payload.actor_user_id,
                description=payload.description,
                project_id=payload.project_id,
                task_id=payload.task_id,
                tag_ids=payload.tag_ids,
                is_billable=payload.is_billable,
                started_at=payload.started_at,
            )
        )

    @app.post("/time-entries/{entry_id}/stop")
    def stop_timer(entry_id: str, payload: StopTimerRequest) -> object:
        return serialize(timeops.stop_timer(entry_id, actor_user_id=payload.actor_user_id, stopped_at=payload.stopped_at))

    @app.post("/time-entries")
    def add_manual_entry(payload: ManualEntryRequest) -> object:
        return serialize(
            timeops.add_manual_entry(
                payload.workspace_id,
                payload.user_id,
                actor_user_id=payload.actor_user_id,
                description=payload.description,
                start_at=payload.start_at,
                end_at=payload.end_at,
                project_id=payload.project_id,
                task_id=payload.task_id,
                tag_ids=payload.tag_ids,
                is_billable=payload.is_billable,
            )
        )

    @app.get("/time-tracker/week")
    def time_tracker_week(workspace_id: str, user_id: str, week_start: str) -> object:
        from datetime import date

        return serialize(timeops.time_tracker_week(workspace_id, user_id, date.fromisoformat(week_start)))

    @app.get("/calendar/week")
    def calendar_week(workspace_id: str, week_start: str, user_ids: str = "") -> object:
        from datetime import date

        selected_users = tuple(user_id for user_id in user_ids.split(",") if user_id)
        return serialize(timeops.calendar_week(workspace_id, date.fromisoformat(week_start), user_ids=selected_users))

    @app.post("/reports/summary")
    def report_summary(payload: ReportSummaryRequest) -> object:
        query = ReportQuery(**payload.model_dump())
        return serialize(timeops.report_summary(query))

    return app


app = create_app()
