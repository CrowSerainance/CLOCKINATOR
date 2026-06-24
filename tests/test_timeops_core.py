from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from unittest import TestCase

from apps.api.timeops_core import TimeOpsService


class TimeOpsServiceTest(TestCase):
    def setUp(self):
        self.service = TimeOpsService()
        self.workspace = self.service.create_workspace("Solo Ops", default_billable_rate=Decimal("25"))
        self.user = self.service.add_user(self.workspace.id, "Ava", "ava@example.test", default_cost_rate=Decimal("10"))
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

    def test_rejects_second_running_timer_for_same_user(self):
        self.service.start_timer(self.workspace.id, self.user.id, started_at=datetime(2026, 6, 22, 9, tzinfo=UTC))

        with self.assertRaises(ValueError):
            self.service.start_timer(self.workspace.id, self.user.id, started_at=datetime(2026, 6, 22, 10, tzinfo=UTC))

    def test_weekly_summary_and_monthly_income(self):
        self.service.add_manual_entry(
            self.workspace.id,
            self.user.id,
            description="Manual moderation block",
            start_at=datetime(2026, 6, 23, 13, tzinfo=UTC),
            end_at=datetime(2026, 6, 23, 16, tzinfo=UTC),
            project_id=self.project.id,
            is_billable=True,
        )

        self.assertEqual(self.service.weekly_summary(self.workspace.id, date(2026, 6, 22)), {self.user.id: 10800})
        self.assertEqual(self.service.monthly_income(self.workspace.id, 2026, 6), Decimal("120.00"))

    def test_csv_export_contains_project_and_duration(self):
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
