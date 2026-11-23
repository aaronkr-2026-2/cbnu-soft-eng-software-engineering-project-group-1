"""Selection regressions and real Streamlit widget reruns (no browser required)."""
import datetime as dt
from pathlib import Path
import unittest

from streamlit.testing.v1 import AppTest

from analysis.generate_figures import METRICS
from research_data import load_exports, metrics, selected_commits, select_records, weekly_commits


ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "analysis"


class DashboardTest(unittest.TestCase):
    def app(self):
        app = AppTest.from_file(str(ROOT / 'dashboard.py'), default_timeout=30).run()
        self.assertFalse(app.exception)
        return app

    def test_default_totals_exclude_legacy(self):
        data = load_exports(DATA_ROOT)
        all_metrics = metrics(data['commits'])
        legacy = metrics(data['scoped']['legacy_frontend'])
        selected = metrics(selected_commits(data))
        for key in METRICS:
            self.assertEqual(selected[key], all_metrics[key] - legacy[key])
        app = self.app()
        self.assertEqual(app.metric[0].value, f"{selected['code_churn']:,}")
        self.assertEqual(app.metric[1].value, f"{selected['non_code_churn']:,}")
        self.assertEqual(len(app.tabs), 5)

    def test_legacy_toggle_updates_metrics(self):
        data = load_exports(DATA_ROOT)
        app = self.app()
        app.toggle(key='legacy').set_value(True).run()
        self.assertFalse(app.exception)
        self.assertEqual(app.metric[0].value, f"{metrics(data['commits'])['code_churn']:,}")
        self.assertEqual(app.metric[2].value, str(len(data['commits'])))

    def test_backend_and_direct_legacy_scope(self):
        data = load_exports(DATA_ROOT)
        app = self.app()
        for scope in ('backend', 'legacy_frontend'):
            app.selectbox(key='scope').select(scope).run()
            self.assertFalse(app.exception)
            self.assertEqual(app.metric[0].value, f"{metrics(data['scoped'][scope])['code_churn']:,}")
            self.assertTrue(app.toggle(key='legacy').disabled)

    def test_empty_week_is_safe_and_documents_remain_visible(self):
        app = self.app()
        app.date_input(key='dates').set_value((dt.date(2026, 9, 21), dt.date(2026, 9, 27))).run()
        self.assertFalse(app.exception)
        self.assertEqual(app.metric[2].value, '0')
        self.assertTrue(any('No matching commits' in element.value for element in app.info))
        self.assertTrue(any('Current inventory' in element.value for element in app.info))

    def test_empty_status_selection_is_safe(self):
        app = self.app()
        app.multiselect(key='statuses').set_value([]).run()
        self.assertFalse(app.exception)
        self.assertTrue(any('Select a status' in element.value for element in app.info))

    def test_cross_scope_and_legacy_only_commits(self):
        def row(hash_value, code):
            value = dict(hash=hash_value, date='2026-09-01', week='2026-08-31', author='Dev1', ai=0)
            value.update(dict.fromkeys(METRICS, 0))
            value.update(added=code, churn=code, code_added=code, code_churn=code)
            return value
        data = {'commits': [row('cross', 15), row('legacy-only', 6)],
                'scoped': {'backend': [row('cross', 10)], 'next': [], 'shared': [],
                           'legacy_frontend': [row('cross', 5), row('legacy-only', 6)]}}
        selected = selected_commits(data)
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0]['code_churn'], 10)
        self.assertEqual(data['commits'][0]['code_churn'], 15)  # never mutate source
        self.assertEqual(len(selected_commits(data, include_legacy=True)), 2)

    def test_inclusive_dates_and_scope_filters(self):
        data = load_exports(DATA_ROOT)
        date = dt.date(2026, 10, 31)
        selected = selected_commits(data, 'next', False, date, date)
        self.assertTrue(selected)
        self.assertTrue(all(row['date'] == str(date) for row in selected))
        logs = select_records(data['logs'], 'backend', False, date, date)
        self.assertTrue(all(row['scope'] == 'backend' and row['date'] == str(date) for row in logs))
        weeks = weekly_commits(selected, date, date)
        self.assertEqual(len(weeks), 1)
        self.assertEqual(weeks[0]['commits'], len(selected))


if __name__ == '__main__':
    unittest.main()
