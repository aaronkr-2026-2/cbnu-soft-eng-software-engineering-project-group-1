"""Regression checks for scope attribution, dated records and report generation."""
import csv
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import repo_stats as stats


class RepoStatsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repo = Path(self.temporary.name) / "repo"
        self.repo.mkdir()
        self.output = Path(self.temporary.name) / "output"
        self.git("init", "-q")

    def git(self, *args, date=None, author="Developer"):
        env = dict(os.environ, GIT_AUTHOR_NAME=author, GIT_AUTHOR_EMAIL="dev@example.test",
                   GIT_COMMITTER_NAME=author, GIT_COMMITTER_EMAIL="dev@example.test",
                   GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        if date:
            env.update(GIT_AUTHOR_DATE=date + "T12:00:00+0900",
                       GIT_COMMITTER_DATE="2026-11-19T12:00:00+0900")
        return subprocess.run(["git", "-C", str(self.repo), *args], env=env,
                              check=True, capture_output=True, text=True).stdout

    def write(self, path, text):
        destination = self.repo / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text, encoding="utf-8")
        return destination

    def commit(self, date, subject="Work", author="Developer"):
        self.git("add", ".")
        self.git("commit", "-qm", subject, date=date, author=author)

    def seed(self):
        self.write("backend/src/a.ts", "one\ntwo\n")
        self.write("backend/PLAN.md", "# Plan\n")
        self.write("next/a.tsx", "next\n")
        self.write("README.md", "# Shared\n")
        self.write("frontend/old.js", "old\n")
        self.write("backend/yarn.lock", "excluded\n")
        self.write("backend/src/café\tfile.ts", "unicode\n")
        binary = self.repo / "backend/picture.png"
        binary.write_bytes(b"\0binary\0")
        self.commit("2026-09-01", "[ai] Initial work", "First")
        self.write("backend/src/a.ts", "one\nchanged\nthree\n")
        self.write("next/notes.md", "# Notes\nline\n")
        self.commit("2026-09-22", "Update both", "Second")

    def test_scope_and_code_non_code_reconcile(self):
        self.seed()
        rows, authors = stats.read_commits(str(self.repo), None)
        self.assertEqual((len(rows), authors), (2, 2))
        self.assertEqual(rows[0]["ai"], 1)
        self.assertEqual(rows[0]["added"], 7)  # binary and lockfile excluded
        self.assertEqual(rows[0]["code_added"], 5)
        for row in rows:
            self.assertEqual(row["churn"], row["code_churn"] + row["non_code_churn"])
            for metric in stats.METRICS:
                self.assertEqual(row[metric], sum(part[metric] for part in row["scopes"].values()))
        for scope in ("backend", "next"):
            scoped = stats.scoped_commits(rows, scope)
            self.assertEqual(len(scoped), 2)
            self.assertEqual([c["author"] for c in scoped], ["Dev1", "Dev2"])
        self.assertEqual(rows[1]["code_deleted"], 1)
        weeks = stats.weekly(rows)
        self.assertEqual(len(weeks), 4)
        self.assertEqual([w["commits"] for w in weeks], [1, 0, 0, 1])

    def test_author_date_filter_and_consistent_pseudonyms(self):
        self.seed()
        rows, authors = stats.read_commits(str(self.repo), "2026-09-22")
        self.assertEqual((len(rows), authors), (1, 1))
        self.assertEqual(rows[0]["author"], "Dev2")
        rows, _ = stats.read_commits(str(self.repo), "2026-10-01")
        self.assertEqual(rows, [])  # committer dates are later, deliberately

    def test_cross_scope_rename_is_delete_plus_add(self):
        self.write("backend/a.ts", "one\ntwo\n")
        self.commit("2026-09-01")
        (self.repo / "next").mkdir()
        (self.repo / "backend/a.ts").rename(self.repo / "next/a.ts")
        self.commit("2026-09-02")
        rows, _ = stats.read_commits(str(self.repo), None)
        self.assertEqual(rows[1]["churn"], 4)
        self.assertEqual(rows[1]["scopes"]["backend"]["deleted"], 2)
        self.assertEqual(rows[1]["scopes"]["next"]["added"], 2)

    def test_log_parser_intent_tools_dates_and_fences(self):
        path = self.write("next/AI_LOG.md", """# AI usage
## Create booking feature — 2026-09-01
**Tool(s) used:** Codex, ChatGPT.
**What I asked for:** Implement booking.
**Verification:** Tests passed; fixed an error.
```markdown
## False note — 2026-09-02
```
- An inline reference to 2026-09-03 does not start a note.
## Undated section
This must not be part of the previous note.
## Invalid — 2026-02-30
## Fix booking — 2026-09-22
**Tool(s) used:** Codex
""")
        entries = stats.dated_entries(path)
        self.assertEqual(len(entries), 2)
        self.assertNotIn("Undated section", entries[0]["text"])
        logs = stats.read_ai_log(path, source="next/AI_LOG.md")
        self.assertEqual(logs[0]["task_type"], "Generate feature")
        self.assertEqual(logs[0]["tool"], "chatgpt;codex")
        self.assertEqual(len(stats.read_ai_log(path, "2026-09-22")), 1)

    def test_local_notes_inventory_and_plan_statuses(self):
        self.write(".gitignore", "backend/SESSION_LOG.md\n")
        self.commit("2026-09-01")
        self.write("backend/SESSION_LOG.md", """# Current context
- 2026-09-22 Repeat summary
# History
## 2026-09-01 — Create booking feature
- Decision: keep the interface. Tests passed.
## 2026-09-22 — Fix booking
- Corrected an error; verification passed.
""")
        self.write("backend/AI_LOG.md", "## Fix booking — 2026-09-22\n**Tool(s) used:** Codex\n")
        self.write("backend/FUTURE_IMPROVEMENTS.md", "| FI-01 | Search | **Completed** | [Plan](SEARCH_PLAN.md) |\n")
        self.write("backend/SEARCH_PLAN.md", "- [x] Add search `src/search.ts`\n- [ ] Review deployment\n")
        self.write(".worktrees/other/SESSION_LOG.md", "## 2026-09-22 — Not this checkout\n")
        self.write("node_modules/pkg/README.md", "Excluded\n")
        self.output.mkdir()
        (self.output / "old.md").write_text("Generated report")
        documents, notes, items = stats.read_documents(self.repo, self.output, "2026-09-22")
        self.assertEqual(len(documents), 4)
        self.assertEqual(len(notes), 2)
        session = next(d for d in documents if d["category"] == "Session log")
        self.assertEqual(session["tracked"], 0)
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["recorded_status"], "Completed")
        self.assertEqual(len(stats.overlapping_notes(notes)), 1)
        weekly = stats.document_weekly(notes)
        self.assertEqual(weekly[0]["session_entries"], 1)
        self.assertEqual(weekly[0]["ai_entries"], 1)
        self.assertGreater(weekly[0]["cumulative_recorded_note_tokens"], 0)
        self.assertEqual(stats.estimate_tokens("12345"), 2)

    def test_even_median_and_empty_summary(self):
        self.seed()
        rows, count = stats.read_commits(str(self.repo), None)
        rows[0]["churn"], rows[1]["churn"] = 1, 4
        self.assertIn("2.5 lines", stats.table1(rows, count, stats.weekly(rows), []))
        self.assertIn("No commits", stats.table1([], 0, [], []))

    def test_cli_compatibility_duplicates_and_empty_period(self):
        self.seed()
        self.write("backend/AI_LOG.md", "## Build feature — 2026-09-22\n**Tool(s) used:** Codex\n")
        command = [sys.executable, str(Path(stats.__file__).resolve()), str(self.repo),
                   "--out", str(self.output), "--no-figures", "--ai-log", "backend/AI_LOG.md",
                   "--ai-log", "backend/AI_LOG.md"]
        subprocess.run(command, check=True, capture_output=True, text=True)
        with (self.output / "ai_log.csv").open() as file:
            self.assertEqual(len(list(csv.DictReader(file))), 1)
        self.assertEqual((self.output / "commits.csv").read_bytes(),
                         (self.output / "combined/commits.csv").read_bytes())
        for scope in stats.SCOPES:
            self.assertTrue((self.output / scope / "weekly.csv").exists())
        subprocess.run(command + ["--since", "2030-01-01"], check=True, capture_output=True, text=True)
        self.assertIn("No commits", (self.output / "table1.md").read_text())
        with (self.output / "dated_notes.csv").open() as file:
            self.assertEqual(list(csv.DictReader(file)), [])
        self.assertIn("AI_LOG.md", (self.output / "documents.csv").read_text())

    def test_custom_output_is_not_reingested(self):
        out = self.repo / "reports"
        out.mkdir()
        (out / "summary.md").write_text("Report")
        self.write("README.md", "Actual docs")
        documents, _, _ = stats.read_documents(self.repo, out, None)
        self.assertEqual([d["source"] for d in documents], ["README.md"])


if __name__ == "__main__":
    unittest.main()
