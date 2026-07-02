from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from unittest import TestCase

from apps.api.timeops_core import TimeOpsService


class TimeOpsServiceTest(TestCase):
    def setUp(self):
        self.service = TimeOpsService()
        self.workspace = self.service.create_workspace("Solo Ops", default_billable_rate=Decimal("25"))
        self.user = self.service.add_user(self.workspace.id, "Ava", "ava@example.test", default_cost_rate=Decimal("10"))
        self.manager = self.service.add_user(self.workspace.id, "Mina", "mina@example.test", default_cost_rate=Decimal("20"))
        self.client = self.service.add_client(self.workspace.id, "Example Client")
        self.project = self.service.add_project(self.workspace.id, "Moderation", client_id=self.client.id, billable_rate=Decimal("40"))
        self.task = self.service.add_task(self.workspace.id, self.project.id, "Queue Review", billable_rate=Decimal("50"))

    def test_timer_start_stop_snapshots_rates_and_audits(self):
        start = datetime(2026, 6, 22, 9, tzinfo=UTC)
        entry = self.service.start_timer(
            self.workspace.id,
            self.user.id,
            description="Review reports",
            project_id=self.project.id,
            task_id=self.task.id,
            is_billable=True,
            started_at=start,
        )

        stopped = self.service.stop_timer(entry.id, actor_user_id=self.user.id, stopped_at=start + timedelta(hours=2))

        self.assertEqual(stopped.duration_seconds, 7200)
        self.assertEqual(stopped.billable_rate_snapshot, Decimal("50"))
        self.assertEqual(stopped.cost_rate_snapshot, Decimal("10"))
        self.assertEqual([log.action for log in self.service.audit_logs], ["time_entry.started", "time_entry.stopped"])
        self.assertEqual(self.service.audit_logs[-1].old_value["duration_seconds"], 0)
        self.assertEqual(self.service.audit_logs[-1].new_value["duration_seconds"], 7200)

    def test_rejects_second_running_timer_for_same_user(self):
        self.service.start_timer(self.workspace.id, self.user.id, started_at=datetime(2026, 6, 22, 9, tzinfo=UTC))

        with self.assertRaises(ValueError):
            self.service.start_timer(self.workspace.id, self.user.id, started_at=datetime(2026, 6, 22, 10, tzinfo=UTC))

    def test_weekly_report_and_monthly_income_summary(self):
        self.service.add_manual_entry(
            self.workspace.id,
            self.user.id,
            description="Manual moderation block",
            start_at=datetime(2026, 6, 23, 13, tzinfo=UTC),
            end_at=datetime(2026, 6, 23, 16, tzinfo=UTC),
            project_id=self.project.id,
            is_billable=True,
        )

        weekly = self.service.weekly_report(self.workspace.id, date(2026, 6, 22))[self.user.id]
        monthly = self.service.monthly_income_summary(self.workspace.id, 2026, 6)

        self.assertEqual(self.service.weekly_summary(self.workspace.id, date(2026, 6, 22)), {self.user.id: 10800})
        self.assertEqual(weekly.total_seconds, 10800)
        self.assertEqual(weekly.revenue, Decimal("120.00"))
        self.assertEqual(monthly.revenue, Decimal("120.00"))
        self.assertEqual(monthly.labor_cost, Decimal("30.00"))
        self.assertEqual(monthly.profit, Decimal("90.00"))

    def test_csv_export_contains_project_duration_and_approval_status(self):
        self.service.add_manual_entry(
            self.workspace.id,
            self.user.id,
            description="CSV proof",
            start_at=datetime(2026, 6, 23, 8, tzinfo=UTC),
            end_at=datetime(2026, 6, 23, 9, 30, tzinfo=UTC),
            project_id=self.project.id,
            task_id=self.task.id,
            is_billable=True,
        )

        csv_text = self.service.export_csv(self.workspace.id)

        self.assertIn("ava@example.test", csv_text)
        self.assertIn("Moderation", csv_text)
        self.assertIn("Queue Review", csv_text)
        self.assertIn("1.50", csv_text)
        self.assertIn("approval_status", csv_text)

    def test_enforces_single_workspace_and_cross_workspace_isolation(self):
        with self.assertRaises(ValueError):
            self.service.create_workspace("Second Workspace")

        multi = TimeOpsService(single_workspace=False)
        first = multi.create_workspace("First")
        second = multi.create_workspace("Second")
        first_user = multi.add_user(first.id, "First", "first@example.test")
        second_project = multi.add_project(second.id, "Other Project")

        with self.assertRaises(KeyError):
            multi.start_timer(first.id, first_user.id, project_id=second_project.id, started_at=datetime(2026, 6, 22, 9, tzinfo=UTC))

    def test_rejects_naive_datetimes(self):
        with self.assertRaises(ValueError):
            self.service.add_manual_entry(
                self.workspace.id,
                self.user.id,
                description="Naive time",
                start_at=datetime(2026, 6, 23, 8),
                end_at=datetime(2026, 6, 23, 9),
            )

    def test_update_delete_split_require_reasons_and_capture_audit(self):
        entry = self.service.add_manual_entry(
            self.workspace.id,
            self.user.id,
            description="Original",
            start_at=datetime(2026, 6, 23, 8, tzinfo=UTC),
            end_at=datetime(2026, 6, 23, 10, tzinfo=UTC),
            project_id=self.project.id,
        )

        with self.assertRaises(ValueError):
            self.service.update_time_entry(entry.id, actor_user_id=self.user.id, reason="", description="No reason")

        updated = self.service.update_time_entry(entry.id, actor_user_id=self.user.id, reason="Fix typo", description="Updated")
        first, second = self.service.split_time_entry(
            updated.id,
            actor_user_id=self.user.id,
            split_at=datetime(2026, 6, 23, 9, tzinfo=UTC),
            second_description="Second half",
            reason="Separate work blocks",
        )

        self.assertEqual(first.duration_seconds, 3600)
        self.assertEqual(second.duration_seconds, 3600)
        self.assertEqual(self.service.audit_logs[-1].action, "time_entry.split")
        self.assertEqual(self.service.audit_logs[-1].reason, "Separate work blocks")

    def test_timesheet_submit_approve_lock_prevents_edits(self):
        entry = self.service.add_manual_entry(
            self.workspace.id,
            self.user.id,
            description="Approval candidate",
            start_at=datetime(2026, 6, 23, 8, tzinfo=UTC),
            end_at=datetime(2026, 6, 23, 10, tzinfo=UTC),
        )

        period = self.service.submit_timesheet(self.workspace.id, self.user.id, period_start=date(2026, 6, 22))

        self.assertEqual(entry.approval_status.value, "submitted")
        with self.assertRaises(ValueError):
            self.service.update_time_entry(entry.id, actor_user_id=self.user.id, reason="Submitted edit", description="Blocked")

        approved = self.service.approve_timesheet(period.id, actor_user_id=self.manager.id, reason="Looks good")
        locked = self.service.lock_timesheet(approved.id, actor_user_id=self.manager.id, reason="Payroll closed")

        self.assertEqual(locked.status.value, "locked")
        self.assertIsNotNone(entry.locked_at)
        self.assertEqual(entry.approval_status.value, "locked")
