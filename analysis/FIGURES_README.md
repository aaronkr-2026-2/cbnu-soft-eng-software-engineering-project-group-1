# Generate research figures and tables

This script reads the existing `repo_stats.py` CSV exports in this folder. It does
not collect Git history, change the source CSVs, or require the application repo.

## Run

Use Python 3.8+ and Matplotlib. From this `analysis/` folder:

```bash
python3 -m pip install -r requirements-figures.txt
python3 generate_figures.py
```

The script defaults to its own folder for input, even when run from elsewhere.
To choose another CSV folder or output folder:

```bash
python3 generate_figures.py --data-dir /path/to/analysis --out /tmp/paper-figures
python3 generate_figures.py --formats png pdf svg
python3 -m unittest discover -s . -p 'test_generate_figures.py' -v
```

## Outputs

`publication/figures/` contains six figures, each exported as PNG, PDF and SVG:

1. `fig1_code_non_code_churn`: weekly combined churn, split into code and non-code.
2. `fig2_application_churn`: backend, Next.js, shared and legacy timelines.
3. `fig3_ai_task_categories`: categories assigned to dated AI log entries.
4. `fig4_document_text_size`: current estimated text tokens by document category.
5. `fig5_recorded_activity`: weekly session and AI log entries, shown separately.
6. `fig6_review_workflow`: illustrative boxes/arrows for reviewing a case's evidence.

`publication/tables/` contains `table1_dataset` and `table2_applications`, each as
Markdown, LaTeX, PNG, PDF and SVG. The LaTeX files are `tabular` fragments with
escaped text and no special packages; include them inside your paper's table
float, adjusting column width/font size for its template.

Use PNG for quick previews, PDF for publication, and SVG for editable shapes/text.
`publication/captions.md` explains each visual and links to its files.
`publication/manifest.json` records source CSV and generator SHA-256 hashes for
reproducibility. Re-running refreshes files for the selected formats; files from
previous runs in other formats remain until manually removed.

## Interpretation and checks

Before plotting, the script checks numeric fields, author-date/week consistency,
code/non-code totals, weekly commit totals, per-commit scope partitions, and dated
note activity/cumulative token accounting. Missing or inconsistent inputs stop the
run. The combined exports are authoritative; duplicate `combined/` files are not
counted again. The existing exported selection is used without date filtering.

Application commit and author counts overlap. Code plus non-code churn and scope
churn reconcile, but churn is neither current source size nor productivity.
Non-code includes Markdown, configuration and other included text files.

Document sizes use the exporter’s approximate characters/4 estimate, not a model
tokenizer, API consumption, cost, or evidence of loaded context. Session and AI
notes can describe the same work. Task categories are keyword-based. Workflow
arrows illustrate a review process; verify actual dated examples before claiming
that sequence or attributing project outcomes to AI. The plots establish no
comparison between guided and unconstrained development on their own.

Inputs are `commits.csv`, `weekly.csv`, `ai_log.csv`, `documents.csv`,
`document_weekly.csv`, `dated_notes.csv`, `plan_items.csv`, and `commits.csv` in
`backend/`, `next/`, `shared/`, and `legacy_frontend/`.
