# MedConnect research dashboard

An interactive, read-only Streamlit presentation of the existing research CSVs.
It follows the explanatory style of the `final-ppt` dashboard: each chart has a
definition, reading guidance and a clear distinction between measurements and
interpretation. No AI service, database or application-repository access is needed.

## Local preview

Use Python 3.11+ (3.12 recommended). From the software engineering repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m streamlit run dashboard.py --server.address 127.0.0.1
```

Open the Local URL printed by Streamlit, normally http://localhost:8501.
Press Ctrl+C in that terminal to stop it.

The app resolves CSVs in `analysis/` relative to the root `dashboard.py`,
independently of the working directory. Replacing the CSVs and rerunning the app refreshes data; nothing is
written back. All required exports stay under `analysis/`, including its `backend/`, `next/`,
`shared/`, and `legacy_frontend/` commit subfolders.
`analysis/generate_figures.py` supplies validation helpers; it is imported but does not
regenerate any assets. Matplotlib is only needed for the separate static-figure
command (`analysis/requirements-figures.txt`), not for the dashboard.

## Repository layout

```text
software-engineering-repository/
  dashboard.py
  research_data.py
  test_dashboard.py
  requirements.txt
  DASHBOARD_README.md
  .streamlit/config.toml
  analysis/
    generate_figures.py
    commits.csv
    weekly.csv
    ...other CSV exports...
    backend/
    next/
    shared/
    legacy_frontend/
    publication/
```

The root `.streamlit/config.toml` supplies the dashboard theme. Include the root
app files **and** `analysis/` data and validation script when deploying.

## Refresh this repository's data

The copied CSVs are the existing export snapshot. To analyze the current checkout:

```bash
python3 repo_stats.py . --no-figures
```

To regenerate the optional publication figures and tables afterward:

```bash
python3 -m pip install -r analysis/requirements-figures.txt
python3 analysis/generate_figures.py
```

`.gitignore` allows the analysis tooling, required dashboard CSVs, `methods.md`,
and `analysis/publication/` downloads to be committed for deployment. Other
generated reports and Python caches remain ignored. The required data is:

- `analysis/{commits,weekly,ai_log,documents,document_weekly,dated_notes,plan_items}.csv`
- `analysis/{backend,next,shared,legacy_frontend}/commits.csv`

Commit and push the app files, dependencies, configuration, and these export
files together. The dashboard displays the committed snapshot; rerunning the
export locally does not update the hosted app until the CSV changes are pushed.

## Explore

- **Overview:** selected totals, legacy accounting and application comparison.
- **Code changes:** weekly churn, additions/deletions and original commit subjects.
- **AI & context:** task categories, dated records, document text-size estimates,
  and cumulative selected-note text.
- **Plans & evidence:** illustrative workflow, self-reported plan statuses and
  dated source note references. The status selector filters the item table;
  the status-distribution chart continues to show the full scoped inventory.
- **Definitions & methods:** glossary, full export methods and publication downloads.

The sidebar selects an application and inclusive date range. Legacy frontend
changes are excluded from the combined view by default. Enabling the toggle adds
those changes back. Cross-scope commits retain only their included line metrics
and count once in the combined view. The legacy scope can be inspected directly,
regardless of the combined-view toggle.

Dates filter commit activity and dated notes. Current documents/plans remain a
current inventory, explicitly labeled without historical date filtering. Static
publication assets likewise describe the original full export, not the dashboard
selection. Current Git-tracked export updates are not automatically fetched.

## Verify

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -p 'test_dashboard.py' -v
```

Tests exercise real Streamlit widget reruns with AppTest and synthetic accounting
cases for legacy-only and cross-application commits. Tests do not change CSVs.

## Streamlit Community Cloud (later)

Nothing is published by these local commands. When the app and reviewed CSVs are
available in the GitHub software engineering repository, Community Cloud can use:

- Repository: `aaronkr-2026-2/cbnu-soft-eng-software-engineering-project-group-1`
- Branch: `main` (after the app and required exports are pushed there)
- Entrypoint: `dashboard.py`
- Python: 3.12
- Dependencies: `requirements.txt`

Community Cloud searches for dependencies beside the entrypoint, then at the
repository root. No app secrets are required. Commit subjects, note titles and
plan descriptions are displayed/downloadable: review the exported dataset and
choose the intended app audience before publishing.

Official references:
- https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/file-organization
- https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/app-dependencies
- https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy

## Limits

Churn is changed lines, not current source size or productivity. AI tags are
explicit commit markers, not confirmed usage. Keyword task categories and recorded
plan statuses require review. Log records overlap. Text tokens are approximate
characters/4 estimates, not actual model tokenization, loaded context or API usage.
The dashboard provides descriptive evidence, not proof of an AI treatment effect.
