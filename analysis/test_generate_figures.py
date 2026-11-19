"""Check CSV validation, escaping, and a complete publication export."""
import csv
import json
from pathlib import Path
import tempfile
import unittest

import generate_figures as generator


class GenerateFiguresTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'data'
        self.root.mkdir()
        self.out = Path(self.temp.name) / 'publication'
        self.metadata = dict(hash='abc12345', date='2026-09-01', week='2026-08-31', author='Dev1', ai=0)
        self.combined = dict(self.metadata, **self.metrics(2, 1))
        self.write('commits.csv', [self.combined])
        self.write('weekly.csv', [dict(week='2026-08-31', commits=1, ai_commits=0, **self.metrics(2, 1))])
        self.write('backend/commits.csv', [dict(self.metadata, **self.metrics(2, 0))])
        self.write('next/commits.csv', [dict(self.metadata, **self.metrics(0, 1))])
        for scope in ('shared', 'legacy_frontend'):
            self.write(scope + '/commits.csv', [], list(self.combined))
        self.write('ai_log.csv', [dict(date='2026-09-01', week='2026-08-31', scope='backend', task_type='Generate feature')])
        self.write('documents.csv', [dict(source='backend/PLAN.md', scope='backend', category='Plan', estimated_tokens=10)])
        self.write('document_weekly.csv', [dict(week='2026-08-31', session_entries=1, ai_entries=1,
                                              estimated_note_tokens=10, cumulative_recorded_note_tokens=10)])
        self.write('dated_notes.csv', [dict(source='backend/SESSION_LOG.md', category='Session log',
                                           date='2026-09-01', week='2026-08-31', estimated_tokens=6),
                                      dict(source='backend/AI_LOG.md', category='AI log',
                                           date='2026-09-01', week='2026-08-31', estimated_tokens=4)])
        self.write('plan_items.csv', [], ['source', 'line', 'recorded_status'])

    def metrics(self, code, non_code):
        return dict(added=code + non_code, deleted=0, churn=code + non_code,
                    code_added=code, code_deleted=0, code_churn=code,
                    non_code_added=non_code, non_code_deleted=0, non_code_churn=non_code)

    def write(self, name, rows, fields=None):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields or list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def test_all_exports_and_input_preservation(self):
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*.csv')}
        data = generator.load_data(self.root)
        entries = generator.render_reports(data, self.root, self.out, ['png', 'pdf', 'svg'])
        self.assertEqual(len(entries), 8)
        for entry in entries:
            for name in entry['files']:
                self.assertGreater((self.out / name).stat().st_size, 100)
        for name in ('table1_dataset', 'table2_applications'):
            self.assertTrue((self.out / 'tables' / (name + '.md')).is_file())
            self.assertIn('\\begin{tabular}', (self.out / 'tables' / (name + '.tex')).read_text())
        summary = (self.out / 'tables/table1_dataset.md').read_text()
        self.assertIn('33.3%', summary)
        manifest = json.loads((self.out / 'manifest.json').read_text())
        self.assertEqual(len(manifest['outputs']), 8)
        self.assertEqual(len(manifest['inputs']['commits.csv']['sha256']), 64)
        self.assertEqual(before, {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*.csv')})

    def test_scope_mismatch_stops_generation(self):
        self.write('backend/commits.csv', [dict(self.metadata, **self.metrics(9, 0))])
        with self.assertRaisesRegex(ValueError, 'reconcile'):
            generator.load_data(self.root)
        self.assertFalse(self.out.exists())

    def test_weekly_mismatch_stops_generation(self):
        self.write('weekly.csv', [dict(week='2026-08-31', commits=2, ai_commits=0, **self.metrics(2, 1))])
        with self.assertRaisesRegex(ValueError, 'totals differ'):
            generator.load_data(self.root)

    def test_duplicate_hash_and_invalid_metadata(self):
        self.write('commits.csv', [self.combined, self.combined])
        with self.assertRaisesRegex(ValueError, 'duplicate commit'):
            generator.load_data(self.root)
        self.write('commits.csv', [self.combined])
        self.write('backend/commits.csv', [dict(self.metadata, author='Dev2', **self.metrics(2, 0))])
        with self.assertRaisesRegex(ValueError, 'metadata differs'):
            generator.load_data(self.root)

    def test_note_count_and_context_mismatch(self):
        self.write('document_weekly.csv', [dict(week='2026-08-31', session_entries=3, ai_entries=1,
                                              estimated_note_tokens=10, cumulative_recorded_note_tokens=10)])
        with self.assertRaisesRegex(ValueError, 'counts differ'):
            generator.load_data(self.root)
        self.write('document_weekly.csv', [dict(week='2026-08-31', session_entries=1, ai_entries=1,
                                              estimated_note_tokens=10, cumulative_recorded_note_tokens=99)])
        with self.assertRaisesRegex(ValueError, 'cumulative'):
            generator.load_data(self.root)

    def test_empty_and_invalid_numeric_inputs(self):
        self.write('commits.csv', [], list(self.combined))
        with self.assertRaisesRegex(ValueError, 'empty'):
            generator.load_data(self.root)
        self.write('commits.csv', [dict(self.combined, ai=2)])
        with self.assertRaisesRegex(ValueError, '0 or 1'):
            generator.load_data(self.root)
        self.write('commits.csv', [dict(self.combined, code_added=-1)])
        with self.assertRaisesRegex(ValueError, 'nonnegative'):
            generator.load_data(self.root)

    def test_no_ai_entries_is_supported(self):
        self.write('ai_log.csv', [], ['date', 'week', 'scope', 'task_type'])
        self.assertEqual(generator.load_data(self.root)['logs'], [])

    def test_table_escaping(self):
        self.assertIn(r'a\&b\_c 50\%', generator.latex_table(['Header'], [['a&b_c 50%']]))
        self.assertIn(r'a\|b', generator.markdown_table(['Header'], [['a|b']]))


if __name__ == '__main__':
    unittest.main()
