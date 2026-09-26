"""无需外部依赖：python -m unittest discover -s backend/tests -p test_checkin_service.py"""
import importlib.util
from pathlib import Path
import unittest
from datetime import datetime

spec = importlib.util.spec_from_file_location(
    'checkin_service', Path(__file__).parents[1] / 'app/services/checkin_service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class CheckinTests(unittest.TestCase):
    def summary(self, timestamps, now='2026-09-24T12:00:00+08:00'):
        return service.build_checkin_summary(timestamps, datetime.fromisoformat(now))

    def test_empty(self):
        result = self.summary([])
        self.assertFalse(result['checked_today'])
        self.assertEqual((result['streak'], result['total_days']), (0, 0))
        self.assertEqual(len(result['recent_days']), 7)

    def test_duplicate_entries_count_once(self):
        result = self.summary(['2026-09-24T01:00:00', '2026-09-24T10:00:00', '2026-09-23T10:00:00'])
        self.assertTrue(result['checked_today'])
        self.assertEqual((result['streak'], result['total_days']), (2, 2))
        self.assertTrue(result['recent_days'][-1]['checked'])

    def test_streak_can_continue_today(self):
        result = self.summary(['2026-09-23T12:00:00', '2026-09-22T12:00:00'])
        self.assertFalse(result['checked_today'])
        self.assertEqual(result['streak'], 2)

    def test_gap_resets_streak_but_preserves_total(self):
        result = self.summary(['2026-09-22T12:00:00', '2026-09-21T12:00:00'])
        self.assertEqual((result['streak'], result['total_days']), (0, 2))

    def test_utc_midnight_boundary(self):
        result = self.summary(['2026-09-23T16:00:00Z', '2026-09-23T15:59:59Z'])
        self.assertTrue(result['checked_today'])
        self.assertEqual(result['streak'], 2)

    def test_invalid_and_future_dates_ignored(self):
        result = self.summary([None, '', 'bad', '2026-09-25T12:00:00'])
        self.assertEqual(result['total_days'], 0)

    def test_month_and_year_boundary(self):
        result = self.summary(['2025-12-31T23:00:00', '2026-01-01T01:00:00'], '2026-01-01T12:00:00+08:00')
        self.assertEqual(result['streak'], 2)

    def test_more_than_fifty_transactions(self):
        result = self.summary(['2026-09-24T01:00:00'] * 100 + ['2026-09-23T01:00:00'])
        self.assertEqual((result['streak'], result['total_days']), (2, 2))


if __name__ == '__main__':
    unittest.main()
