# Repository analysis methods

Backend: backend/ (NestJS). Frontend: next/ (Next.js). Historical frontend/ is
reported separately as legacy_frontend; all other paths are shared. Shared docs
remain assigned by path, even when their content discusses both applications.

Git scope: non-merge commits reachable from HEAD, not every branch or worktree.
Dates are Git author calendar dates; --since includes that date and filters both
commits and dated log records. Author IDs are assigned across the whole history
before filtering, and remain consistent across reports. They identify author
names, not verified individual people. Combined counts each commit once, including
commits with zero included text changes. Application reports include only commits
with included text changes in their paths. Cross-application commits occur in
multiple reports, so commit and contributor counts must not be summed.

Churn = added + deleted lines, including blanks and comments, not current LOC.
Code extensions are explicitly listed in CODE_EXTENSIONS in repo_stats.py;
all other included text is non-code (Markdown, configuration, SVG, etc.). Tests
and styles count as code. Generated/dependency directories, common lockfiles,
minified JS/CSS, analysis outputs and binaries are excluded from line metrics.
Renames count as deletion + addition (--no-renames), including cross-scope moves.
Code + non-code = total churn; backend + next + shared + legacy churn = combined.

AI-tagged means an explicit commit-message pattern, not confirmed AI use.
AI log task categories use title and request text with first matching keyword
category; tools use the tool field where available. These are heuristics.
AI logs default to backend/AI_LOG.md, next/AI_LOG.md and root AI_LOG.md if present.
Use repeated --ai-log arguments to replace that selection.

Documents are current local Markdown/MDX, including ignored notes but excluding
worktrees/dependencies/outputs and symlinks. categories use filenames. The dated
parser recognizes ISO dates in headings, list entries and table rows, not prose
or fenced code. Session/AI records may overlap; no unique-task total is claimed.
Plan checkboxes and FI roadmap rows preserve recorded statuses and references
for manual verification; they do not prove delivery, benefit, or time saved.

Estimated tokens = ceil(characters / 4), a coarse heuristic, particularly uncertain
for non-English text and code. This is not actual model tokenization, usage, cost,
cached input, or evidence that a document was loaded. Dated note sizes use current
surviving text, not historical snapshots. --since filters note activity but not
current document inventory or undated plan items. Mention flags can include
negations and templates and need manual review. Ignored logs have no Git churn
unless they were historically tracked.

Existing root commits.csv, weekly.csv, ai_log.csv, table1.md and figure names are
retained as combined reports. Scoped reports live in combined/, backend/, next/,
shared/, and legacy_frontend/. Empty scopes still receive CSV headers and tables;
commit charts require at least one commit. Nonempty AI logs receive a task chart
independently. Tables and CSVs are generated without matplotlib using --no-figures.

Author names are pseudonymized, but commit subjects, log titles and plan-item text
are retained. Review exported artifacts before sharing. Outputs describe this
checkout and HEAD; they do not establish deployed behavior or external AI usage.
