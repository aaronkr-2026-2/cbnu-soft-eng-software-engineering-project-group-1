# MedConnect project analysis

This document explains the research data in `analysis/` and its presentation through `dashboard.py`. It is a text source for writing a case study about MedConnect's development, including code changes, planning, documentation, and recorded AI collaboration.

**Research dashboard:** [MedConnect Research Explorer on Streamlit](https://cbnu-research-final.streamlit.app/).

The explanations and figures below were reviewed against the local source code and exported data. The hosted dashboard is provided as an access link; its current contents were not independently verified during this review.

## 1. Project context

MedConnect is a healthcare appointment platform for patients, doctors, and clinics. It brings clinic and doctor discovery, appointment booking, and appointment status information into one service. The repository describes patient journeys such as authentication, booking, appointment management, waitlists, and notifications, alongside clinic and doctor scheduling workflows.

The backend in `backend/` uses NestJS, TypeScript, and MongoDB/Mongoose, with GraphQL and REST interfaces. The current frontend in `next/` uses Next.js. An earlier application under `frontend/` was subsequently removed and is retained in the research accounting as the legacy frontend.

The Streamlit application serves a separate purpose: it lets readers examine evidence about the development of MedConnect. Its measures concern repository changes and development records, rather than patient activity or clinical outcomes. Product implementation and deployment claims require their own verification; the research exports do not establish that every documented feature is enabled in production.

## 2. Evidence and processing

The research workflow has three main stages:

1. `repo_stats.py` extracts repository change statistics and local Markdown records into the CSV and summary files in `analysis/`.
2. `research_data.py` loads and selects exported records, calculates dashboard totals, and applies application, date, and legacy filters. It reuses validation and loading functions from `analysis/generate_figures.py`.
3. `dashboard.py` presents the selected data through Streamlit and Plotly. Separately, `analysis/generate_figures.py` produces the publication figures and tables.

The dashboard re-reads the exported files on reruns. It does not fetch live Git history or call AI services. New development activity becomes visible only after the relevant exports are updated. Exported accounting is validated before display, and loading errors stop the dashboard with an explanation.

### Contents of the analysis folder

| File or directory | Evidence and purpose |
| --- | --- |
| `commits.csv` | Combined commit records, including dates, author pseudonyms, subjects, and line-change measures. |
| `weekly.csv` | Weekly commit and churn totals, including weeks with zero recorded commits. |
| `ai_log.csv` | Dated AI-log entries with source locations, application scope, tool labels, and inferred task categories. |
| `documents.csv` | Current document inventory, tracking status, text sizes, categories, and approximate token counts. |
| `dated_notes.csv` | Dated records extracted from current notes, with source files, line numbers, titles, and keyword mention flags. |
| `document_weekly.csv` | Weekly AI/session record counts and estimated surviving note text. |
| `plan_items.csv` | Extracted checkboxes and roadmap rows, preserving recorded statuses and references. |
| `log_overlap_candidates.csv` | Candidate overlaps between AI and session notes for manual review. |
| `combined/`, `backend/`, `next/`, `shared/`, `legacy_frontend/` | Scope-specific exports and summaries. Combined files duplicate the combined selection and must not be counted again. |
| `methods.md`, `comparison.md`, `document_summary.md`, `table1.md` | Written definitions and summary results. |
| `generate_figures.py`, `test_generate_figures.py`, `requirements-figures.txt`, `FIGURES_README.md` | Publication generation, validation checks, dependencies, and instructions. |
| `publication/` | Figures, tables, captions, and a manifest containing source CSV and generator hashes. |

The exports retain commit subjects, note titles, and plan text. Source paths and line numbers help a researcher return to the original records. Author names are pseudonymized, but those other text fields remain part of the evidence.

## 3. Dataset summary and scope

The full exported selection covers **September 11 to November 19, 2026**, across **11 Monday-based weekly intervals**. It includes non-merge commits reachable from the analyzed HEAD, rather than every branch or worktree.

| Measure | Full export, including legacy frontend |
| --- | ---: |
| Non-merge commits | 132 |
| Distinct author pseudonyms | 6 |
| Lines added | 69,650 |
| Lines deleted | 10,802 |
| Total churn | 80,452 |
| Code churn | 64,809 |
| Non-code churn | 15,643 |
| Median churn per commit | 287 lines |
| Explicitly AI-tagged commits | 0 |
| AI-log entries | 145 |
| Session-note entries | 82 |

Author pseudonyms identify distinct Git author names, which are not necessarily distinct people. Although the original dataset table labels this count as developers, a case study should describe the measured quantity precisely.

Churn means added lines plus deleted lines. Replacing 20 existing lines with 20 new lines contributes 40 lines of churn. Repeated edits, comments, and blank lines count. Churn therefore describes accumulated change rather than the current size of the codebase, hours of work, or productivity.

Code includes source files, tests, styles, and scripts according to the exporter's extension list. Non-code includes Markdown, configuration, SVG, and other included text. Binaries, common lockfiles, dependency/build outputs, and generated analysis are excluded from line metrics. Renames are treated as deletion plus addition.

### Application comparison

| Scope | Commits | Author IDs | Code churn | Non-code churn | Total churn | AI-log entries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Backend | 59 | 3 | 31,281 | 5,459 | 36,740 | 92 |
| Next.js frontend | 43 | 2 | 22,083 | 2,984 | 25,067 | 53 |
| Shared / other | 102 | 4 | 7,887 | 6,924 | 14,811 | 0 |
| Legacy frontend | 3 | 3 | 3,558 | 276 | 3,834 | 0 |

Scopes are assigned by file path. Shared documentation remains shared even when its content discusses the backend or frontend. Scope churn totals partition the combined churn, but commit and author counts overlap across scopes and must not be summed.

The backend has the largest scoped churn and AI-log count in this export. This describes the distribution of recorded activity; it does not establish relative difficulty, effort, or benefit from AI assistance.

### Dashboard default versus full export

The dashboard excludes the legacy frontend from the combined view by default. Across the full date range, this produces **130 commits**, **5 author IDs**, and **76,618 lines of churn**, comprising **61,251 code lines** and **15,367 non-code lines**.

The legacy frontend contributes 1,917 additions and 1,917 deletions, or 3,834 lines of churn. Removing legacy changes subtracts only those paths. Commits that also changed other scopes retain their remaining changes and are counted once in the combined view.

The publication bundle uses the full exported selection, including legacy changes. Its totals do not change when a reader adjusts dashboard filters. Any case-study quotation of totals should identify the selection used.

## 4. Reading the Streamlit dashboard

The sidebar selects the application and an inclusive reporting date range. The legacy toggle applies to the combined view. Commit dates use Git author calendar dates; notes use their recorded dates. Weeks begin on Monday, and the first and last weeks can be partial.

### Overview

The Overview tab presents code churn, non-code churn, commit counts, and AI-log entry counts. It explains the non-code share and identifies the selected period's largest weekly churn total. An application comparison table and chart show how changes are distributed across scopes.

For the full export, the largest weekly churn is **22,482 lines in the week starting October 26, 2026**. This is a useful period to investigate through individual commits. Its size alone does not identify the cause of the changes or prove a productivity increase.

### Code changes

This tab shows weekly code and non-code churn, followed by additions and deletions. Empty weeks remain visible. For example, the week starting September 21 has zero recorded commits in the export; that does not establish that no planning or other work occurred.

The commit explorer exposes dates, hashes, author IDs, subjects, and change totals. These records help connect a weekly peak to particular changes. Commit subjects are descriptions to investigate, rather than independent evidence that a feature was delivered or verified.

### AI & context

This tab compares AI-log entries, session notes, and explicitly AI-tagged commits. The export contains 145 AI-log entries despite having no commits that match the explicit AI-message patterns. Absence of those markers cannot establish absence of AI use.

The inferred task categories are:

| Category | Entries |
| --- | ---: |
| Other | 61 |
| Generate feature | 50 |
| Docs | 15 |
| Debug / fix | 9 |
| Refactor / clean | 5 |
| Test | 4 |
| Explain / learn | 1 |

Categories use the first matching keyword rule applied to entry titles and requests. They are not manually validated task classifications. The large Other category and possible ambiguities should be reviewed before drawing conclusions about how AI was used. Counts represent records, rather than unique tasks, conversations, API calls, or hours.

Weekly AI and session counts are plotted separately. There are **59 possible overlap candidates**, requiring manual review; these are not 59 confirmed duplicates. The 145 AI records and 82 session records should not be added into a unique-task total.

The tab also shows the current document inventory and cumulative surviving dated-note text. The application filter applies to the inventory, but reporting dates do not reconstruct historical document contents. The cumulative line attributes current surviving note text to recorded dates; it does not measure historical context-window size.

### Plans & evidence

This tab presents an illustrative sequence: **plan/request → AI-assisted work → human review → verification**. The diagram proposes a way to examine evidence. It does not establish that every recorded task followed that sequence.

The current inventory contains **51 extracted plan items**: 29 checked items, 14 unchecked items, 4 Completed roadmap rows, 3 Backlog rows, and 1 Planned row. These statuses are preserved as recorded. Roadmap rows and checkboxes may describe overlapping work, and completion labels require implementation and verification evidence.

The status selector filters the evidence table; the status chart still shows all current scoped plan items. Plan items are filtered by application, but not by reporting dates. Dated source notes provide titles and source locations for investigating individual examples.

### Definitions & methods

This tab explains metric definitions, scope accounting, exclusions, date handling, and interpretation limits. It also offers downloads from the publication bundle. Interactive chart controls support zooming and SVG export, while comparison tables and selected records can be downloaded as CSV.

## 5. Documentation as development evidence

The exported inventory contains **34 current documents** with **250,094 estimated text tokens**.

| Category | Files | Estimated text tokens |
| --- | ---: | ---: |
| Project documentation | 13 | 83,688 |
| AI log | 2 | 72,485 |
| Plan | 6 | 36,931 |
| Session log | 2 | 22,260 |
| Sprint record | 8 | 17,942 |
| Agent instructions | 2 | 13,142 |
| Future improvements | 1 | 3,646 |

This inventory supplies evidence about the written material available around development: architecture, implementation plans, sprint records, AI activity, session continuity, and agent instructions. It includes ignored local Markdown, so another checkout may not reproduce the same inventory without those files.

Estimated tokens are calculated as `ceil(characters / 4)` per file. This is a coarse text-size estimate, especially uncertain for non-English text and code. It does not measure actual tokenizer output, loaded model context, API consumption, cached input, or cost. Document volume also does not establish that a person or AI read or followed the documents.

## 6. Publication figures and tables in words

The publication folder contains six figures, each in PNG, PDF, and SVG formats:

1. **Weekly code/non-code churn:** shows the timing and composition of accumulated repository changes.
2. **Application churn:** compares backend, Next.js, shared, and legacy weekly change totals on a common timeline.
3. **AI task categories:** shows the keyword-based distribution of AI-log entries.
4. **Document text size:** compares approximate current text sizes across document categories.
5. **Recorded activity:** places weekly session-note and AI-log counts side by side without treating them as distinct tasks.
6. **Review workflow:** illustrates how a researcher can connect planning, AI assistance, human review, and verification.

Two tables summarize the full dataset and compare applications. Each table is available as Markdown, LaTeX, PNG, PDF, and SVG. Captions explain the visuals and their limits. The manifest records source CSV and generator hashes to help identify the inputs used for a publication run.

## 7. Using the evidence in a MedConnect case study

The dataset supports a descriptive account of MedConnect's development over the exported period. A case study can examine the timing and distribution of code changes, the scope of recorded AI assistance, the role of written plans and continuity records, and examples of human review and verification.

For a concrete development episode, trace the dated request or plan to its AI-log record, implementation commit or code change, recorded human decision or correction, and verification result. Record which parts of that chain are supported and which remain uncertain. Source locations and commit hashes make those examples reviewable.

The combined evidence does not independently establish time saved, improved software quality, deployment readiness, or an advantage over development without AI. There is no controlled guided-versus-unconstrained comparison in these exports. Keyword mention flags can match templates or negative statements, so they must not be presented as confirmed counts of mistakes, corrections, or successful outcomes.

A defensible central description is: **MedConnect is a documented software-development case in which repository changes can be examined alongside recorded AI collaboration, planning, human review, and verification.** Quantitative totals describe the recorded activity; carefully traced examples explain how particular development decisions were made.

## 8. Source references and local use

- [Research dashboard](https://cbnu-research-final.streamlit.app/)
- [Project README](README.md)
- [Streamlit presentation](dashboard.py)
- [Dashboard data selection and accounting](research_data.py)
- [Repository exporter](repo_stats.py)
- [Export methodology](analysis/methods.md)
- [Application comparison](analysis/comparison.md)
- [Document summary](analysis/document_summary.md)
- [Dataset summary](analysis/table1.md)
- [Publication generation instructions](analysis/FIGURES_README.md)
- [Publication captions](analysis/publication/captions.md)

Run the dashboard from the repository root with `python3 -m streamlit run dashboard.py`. Generate publication assets from the existing exports with `python3 analysis/generate_figures.py`. Figure generation does not recollect repository history or modify the source CSVs.

This document describes the existing export ending November 19, 2026. Future exports may change its totals, document inventory, and source line references.
