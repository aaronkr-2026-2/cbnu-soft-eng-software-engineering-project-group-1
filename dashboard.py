"""Streamlit presentation of the exported MedConnect research data.

Run: python3 -m streamlit run dashboard.py (from the research repo).
"""
import datetime as dt
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from research_data import (LABELS, comparison, load_exports, metrics, note_activity,
                           recorded_note_tokens, select_records, selected_commits, weekly_commits)


APP_ROOT = Path(__file__).resolve().parent
DATA_ROOT = APP_ROOT / "analysis"
COLORS = {"Code": "#335c81", "Non-code": "#90b4b2", "Backend (NestJS)": "#335c81",
          "Frontend (Next.js)": "#b76e39", "Shared / other": "#64748b", "Legacy frontend": "#8b70a8"}

st.set_page_config(page_title="MedConnect · Research explorer", page_icon="📊", layout="wide")
st.markdown("""<style>
.block-container {max-width: 1300px; padding-top: 4rem;}
h1, h2, h3 {color: #15334b;}
[data-testid="stMetric"] {background: #f2f6f8; border: 1px solid #dce5ea; padding: 1rem; border-radius: .6rem;}
[data-testid="stMetricLabel"] {font-size: 1rem;}
[data-testid="stMetricValue"] {font-size: 1.9rem;}
</style>""", unsafe_allow_html=True)


def chart(figure, key):
    figure.update_layout(font=dict(size=14), margin=dict(t=35, l=15, r=15, b=25),
                         legend_title_text="", paper_bgcolor="rgba(0,0,0,0)",
                         legend=dict(orientation="h", y=1.14, x=0), height=370)
    if key in {"weekly_churn", "additions_deletions", "dated_activity", "recorded_text"} and figure.data:
        ticks = list(figure.data[0].x)
        step = max(1, (len(ticks) + 7) // 8)
        figure.update_xaxes(tickmode="array", tickvals=ticks[::step], tickformat="%d %b %Y")
    st.plotly_chart(figure, key=key, width="stretch",
                    config={"displaylogo": False, "toImageButtonOptions": {"format": "svg", "filename": key}})


def show_table(frame):
    labels = {"author": "Author ID", "authors": "Author IDs", "hash": "Commit", "line": "Source line",
              "churn": "Total churn", "ai": "AI marker", "subject": "Commit subject"}
    display = frame.rename(columns=lambda name: labels.get(name, name.replace("_", " ").capitalize()))
    st.dataframe(display, hide_index=True, width="stretch")


def csv_download(rows, label, filename, key):
    frame = rows if isinstance(rows, pd.DataFrame) else pd.DataFrame(rows)
    st.download_button(label, frame.to_csv(index=False).encode("utf-8"), filename,
                       mime="text/csv", key=key)


def workflow():
    figure = go.Figure()
    labels = ["Plan / request", "AI-assisted work", "Human review", "Verification"]
    for index, label in enumerate(labels):
        figure.add_shape(type="rect", x0=index * 3, x1=index * 3 + 2.4, y0=0.8, y1=2,
                         fillcolor="#edf3f6", line_color="#335c81")
        figure.add_annotation(x=index * 3 + 1.2, y=1.4, text=label, showarrow=False,
                              font=dict(size=15, color="#15334b"))
        if index:
            figure.add_annotation(x=index * 3 - 0.06, y=1.4, ax=index * 3 - 0.53, ay=1.4,
                                  xref="x", yref="y", axref="x", ayref="y", arrowhead=2, text="")
    figure.update_xaxes(visible=False, range=[-0.2, 11.6])
    figure.update_yaxes(visible=False, range=[0.5, 2.3])
    figure.update_layout(height=180, margin=dict(t=5, b=5, l=5, r=5), plot_bgcolor="rgba(0,0,0,0)")
    st.plotly_chart(figure, key="workflow", width="stretch", config={"displayModeBar": False})


def main():
    try:
        # CSVs are small. Re-reading on rerun keeps updates visible without stale caches.
        data = load_exports(DATA_ROOT)
    except (OSError, ValueError) as error:
        st.error(f"The exported data could not be loaded: {error}")
        st.info("Restore a consistent repo_stats.py export in the analysis/ folder, then rerun.")
        st.stop()

    all_dates = [dt.date.fromisoformat(row["date"]) for row in data["commits"] + data["notes"] + data["logs"]]
    first, last = min(all_dates), max(all_dates)
    st.sidebar.title("Research explorer")
    scope = st.sidebar.selectbox("Application", list(LABELS), format_func=LABELS.get, key="scope")
    window = st.sidebar.date_input("Reporting dates", value=(first, last), min_value=first,
                                    max_value=last, format="YYYY-MM-DD", key="dates")
    include_legacy = st.sidebar.toggle("Include legacy frontend", value=False,
                                        disabled=scope != "combined", key="legacy")
    st.sidebar.caption("The legacy frontend was later removed. Combined results exclude its changes by default.")
    st.sidebar.divider()
    st.sidebar.markdown("**Reading the dashboard**\n\nHover to inspect values. Use chart controls to zoom or download SVG. Tables and selected records can be downloaded as CSV.")
    if not isinstance(window, (tuple, list)) or len(window) != 2:
        st.info("Choose both a start and an end date.")
        st.stop()
    start, end = window
    if start > end:
        st.error("The start date must be before the end date.")
        st.stop()

    records = selected_commits(data, scope, include_legacy, start, end)
    logs = select_records(data["logs"], scope, include_legacy, start, end)
    notes = select_records(data["notes"], scope, include_legacy, start, end)
    docs = select_records(data["docs"], scope, include_legacy)
    plans = select_records(data["plans"], scope, include_legacy)
    amount = metrics(records)
    weeks = pd.DataFrame(weekly_commits(records, start, end))
    selected_label = LABELS[scope]
    if scope == "combined":
        selected_label += " · " + ("legacy included" if include_legacy else "legacy excluded")

    st.caption("MEDCONNECT / SOFTWARE ENGINEERING CASE STUDY")
    st.title("How the project changed")
    st.markdown("Explore code changes, planning records, and recorded AI collaboration. Definitions and reading notes accompany each result.")
    st.caption(f"{selected_label}  |  {start:%d %b %Y} – {end:%d %b %Y}  |  Exported data, not a live Git connection")

    overview, changes, ai, evidence, methods = st.tabs(["Overview", "Code changes", "AI & context", "Plans & evidence", "Definitions & methods"])

    with overview:
        cols = st.columns(4)
        cols[0].metric("Code churn", f"{amount['code_churn']:,}", help="Source lines added + deleted; includes tests, styles and scripts.")
        cols[1].metric("Non-code churn", f"{amount['non_code_churn']:,}", help="Markdown, configuration and other included text lines added + deleted.")
        cols[2].metric("Commits", f"{amount['commits']:,}", help="Unique non-merge commits in the selected view.")
        cols[3].metric("AI log entries", f"{len(logs):,}", help="Dated records of AI-assisted work, not necessarily unique tasks or calls.")
        st.subheader("What these numbers mean")
        if amount["churn"]:
            st.markdown(f"This selection contains **{amount['churn']:,} changed lines**. "
                        f"Non-code files account for **{100 * amount['non_code_churn'] / amount['churn']:.1f}%**. "
                        "Churn measures accumulated changes, including repeated edits; it is not the amount of code currently in the project.")
            peak = weeks.loc[weeks["churn"].idxmax()]
            st.markdown(f"The largest weekly total is **{int(peak['churn']):,} lines** in the week starting "
                        f"**{peak['week']:%d %b %Y}**. Use the commit explorer to investigate which changes contributed.")
        else:
            st.info("No matching commits. Dated records and the current document inventory remain available in the other tabs.")
        if scope == "combined":
            historical = metrics(selected_commits(data, "legacy_frontend", True, start, end))
            st.info(f"Legacy frontend accounting: {historical['added']:,} added + {historical['deleted']:,} deleted "
                    f"= {historical['churn']:,} changed lines in this period. "
                    + ("These changes are included." if include_legacy else "These changes are excluded; cross-application commits retain their other changes."))
        st.subheader("Application comparison")
        st.caption("The date range applies to all rows. Commits and authors can overlap across applications; line counts partition the selection.")
        compared = comparison(data, scope, include_legacy, start, end)
        table = pd.DataFrame(compared)[["application", "commits", "authors", "code_churn", "non_code_churn", "churn"]]
        show_table(table)
        csv_download(table, "Download application comparison", "application_comparison.csv", "comparison_csv")
        long = table.melt(id_vars="application", value_vars=["code_churn", "non_code_churn"], var_name="kind", value_name="lines")
        long["kind"] = long["kind"].map({"code_churn": "Code", "non_code_churn": "Non-code"})
        chart(px.bar(long, x="application", y="lines", color="kind", color_discrete_map=COLORS,
                     labels={"application": "", "lines": "Lines added + deleted", "kind": ""}), "application_comparison")

    with changes:
        st.subheader("Code versus non-code over time")
        st.markdown("**Churn = added lines + deleted lines.** Replacing 20 existing lines with 20 new lines creates 40 lines of churn. Empty weeks stay on the timeline.")
        long = weeks.melt(id_vars="week", value_vars=["code_churn", "non_code_churn"], var_name="kind", value_name="lines")
        long["kind"] = long["kind"].map({"code_churn": "Code", "non_code_churn": "Non-code"})
        chart(px.bar(long, x="week", y="lines", color="kind", color_discrete_map=COLORS,
                     labels={"week": "Week starting Monday", "lines": "Lines added + deleted"}), "weekly_churn")
        st.subheader("Additions and deletions")
        st.markdown("Mostly additions can reflect new construction. Deletions can reflect cleanup, replacement or removal. Neither direction alone proves quality or productivity.")
        directional = weeks.melt(id_vars="week", value_vars=["added", "deleted"], var_name="change", value_name="lines")
        chart(px.bar(directional, x="week", y="lines", color="change", barmode="group",
                     color_discrete_map={"added": "#335c81", "deleted": "#b76e39"},
                     labels={"week": "Week starting Monday", "lines": "Changed lines"}), "additions_deletions")
        st.subheader("Commit explorer")
        st.caption("Line metrics respect the application and legacy filters. Commit subjects remain original; they are evidence to investigate, not proof of delivery.")
        if records:
            commits = pd.DataFrame(records).sort_values(["churn", "date"], ascending=[False, False])
            fields = ["date", "hash", "author", "subject", "added", "deleted", "code_churn", "non_code_churn", "churn"]
            show_table(commits[fields])
            csv_download(commits[fields], "Download selected commits", "selected_commits.csv", "commits_csv")
        csv_download(weeks, "Download selected weekly data", "selected_weekly.csv", "weekly_csv")

    with ai:
        st.subheader("Recorded AI collaboration")
        cols = st.columns(3)
        cols[0].metric("AI log entries", f"{len(logs):,}")
        cols[1].metric("Session notes", f"{sum(n['category'] == 'Session log' for n in notes):,}")
        cols[2].metric("AI-tagged commits", f"{amount['ai_commits']:,}")
        st.markdown("AI-tagged commits contain explicit message markers. A zero count does not establish that AI was unused. AI logs and session notes can describe the same work; their counts are not a unique-task total.")
        if logs:
            tasks = pd.DataFrame(logs).groupby("task_type", as_index=False).size().rename(columns={"size": "entries"}).sort_values("entries")
            chart(px.bar(tasks, x="entries", y="task_type", orientation="h", color_discrete_sequence=["#335c81"],
                         labels={"entries": "AI log entries", "task_type": ""}), "ai_categories")
            st.caption("Task categories use keyword rules applied to the title/request. Review 'Other' and ambiguous entries before using categories as research findings.")
        else:
            st.info("No AI log entries match this selection.")
        activity = pd.DataFrame(note_activity(notes, start, end))
        long = activity.melt(id_vars="week", value_vars=["session_entries", "ai_entries"], var_name="record", value_name="entries")
        long["record"] = long["record"].map({"session_entries": "Session notes", "ai_entries": "AI log entries"})
        chart(px.bar(long, x="week", y="entries", color="record", barmode="group",
                     color_discrete_sequence=["#335c81", "#90b4b2"],
                     labels={"week": "Week starting Monday", "entries": "Recorded entries"}), "dated_activity")

        st.subheader("How much text supports the workflow?")
        st.info("Current inventory: the application/legacy filter applies here, but the reporting dates do not. Estimated text tokens are ceil(characters / 4), not actual model tokens, API consumption, costs, or evidence that the AI loaded a file.")
        if docs:
            sizes = pd.DataFrame(docs).groupby("category", as_index=False)["estimated_tokens"].sum().sort_values("estimated_tokens")
            chart(px.bar(sizes, x="estimated_tokens", y="category", orientation="h", color_discrete_sequence=["#335c81"],
                         labels={"estimated_tokens": "Estimated current text tokens", "category": ""}), "document_size")
            with st.expander("Inspect current documents"):
                show_table(pd.DataFrame(docs))
                csv_download(docs, "Download document inventory", "current_documents.csv", "docs_csv")
        else:
            st.info("No current documents are assigned to this application scope.")
        recorded = recorded_note_tokens(notes)
        if recorded:
            st.subheader("Recorded note text in this period")
            chart(px.line(pd.DataFrame(recorded), x="week", y="cumulative_recorded_text_tokens", markers=True,
                          labels={"week": "Week starting Monday", "cumulative_recorded_text_tokens": "Cumulative estimated note tokens"},
                          color_discrete_sequence=["#335c81"]), "recorded_text")
            st.caption("This attributes surviving current note text to its recorded date. It is not historical context-window size. Overlapping AI/session descriptions remain separate text records.")

    with evidence:
        st.subheader("From plans to evidence")
        workflow()
        st.caption("Illustrative workflow. The arrows do not establish that every task followed this sequence or that AI caused an outcome.")
        st.markdown("For a case example, link a dated request or plan to a commit, human decision/correction, and recorded verification. A checked box or a 'Completed' label alone is a self-reported status.")
        st.subheader("Recorded plan items")
        st.caption("Current plan inventory; application filtering applies, reporting dates do not. Roadmap rows and checkboxes may describe overlapping work.")
        if plans:
            statuses = sorted({row["recorded_status"] for row in plans})
            chosen = st.multiselect("Recorded status", statuses, default=statuses, key="statuses")
            selected_plans = [row for row in plans if row["recorded_status"] in chosen]
            status_counts = pd.DataFrame(plans).groupby("recorded_status", as_index=False).size().rename(columns={"size": "items"})
            chart(px.bar(status_counts, x="recorded_status", y="items", color_discrete_sequence=["#335c81"],
                         labels={"recorded_status": "Recorded status", "items": "Items (can overlap)"}), "plan_status")
            st.caption("The chart shows all current scoped plan items; the status selector filters the evidence table below.")
            if selected_plans:
                show_table(pd.DataFrame(selected_plans)[["source", "line", "recorded_status", "item", "references"]])
                csv_download(selected_plans, "Download selected plan items", "plan_items.csv", "plans_csv")
            else:
                st.info("Select a status to inspect matching plan items.")
        else:
            st.info("No extracted plan items are assigned to this application.")
        st.subheader("Dated source notes")
        st.caption("Titles and source line numbers help trace evidence. Keyword mention flags are not treated as confirmed mistake or decision counts.")
        if notes:
            note_frame = pd.DataFrame(notes).sort_values(["date", "source"])
            show_table(note_frame[["date", "category", "source", "line", "title"]])
            csv_download(note_frame, "Download selected notes", "dated_notes.csv", "notes_csv")
        else:
            st.info("No dated notes match this selection.")

    with methods:
        st.subheader("Definitions")
        definitions = [
            ["Code churn", "Source lines added + deleted. Includes tests, styles and scripts. Repeated edits count again."],
            ["Non-code churn", "Markdown, configuration and other included text lines added + deleted."],
            ["Total churn", "Code churn + non-code churn. Not current lines of code, effort, quality or productivity."],
            ["Legacy frontend", "Historical frontend/ application. Adding N lines and later deleting N creates 2N churn before intermediate edits."],
            ["Commits", "Unique selected non-merge commits. A commit touching two scopes appears in both scope counts."],
            ["Authors", "Distinct pseudonyms derived from author names, not verified individual people."],
            ["AI-tagged commit", "Explicit AI message pattern. Absence of a marker does not establish absence of AI use."],
            ["AI/session entry", "Dated record in a current local log. Entries may overlap and are not necessarily sessions or unique tasks."],
            ["Estimated text tokens", "Approximate characters/4 text size. Not actual tokenization, API usage, loaded context or cost."],
            ["Recorded plan status", "Self-reported checkbox/roadmap status, requiring implementation and verification evidence."],
        ]
        st.dataframe(pd.DataFrame(definitions, columns=["Term", "Definition"]), hide_index=True, width="stretch")
        st.subheader("Selection and accounting")
        st.markdown("""
- Dates are inclusive author dates for commits and recorded dates for notes. Weeks start Monday; boundary weeks can be partial.
- Excluding legacy subtracts only legacy paths. A cross-application commit keeps its remaining changes and is counted once in the combined view.
- Backend, Next.js, shared, and legacy line totals partition the combined total. Commit and author counts overlap.
- Current document/plan inventory is not reconstructed historically when dates change.
- Source exports exclude merge commits, binaries, common lockfiles, dependency/build outputs and generated analysis. Renames were counted as deletion plus addition.
- The dashboard validates exported accounting before display. It re-reads local CSVs; it neither fetches Git history nor calls AI services.
""")
        with st.expander("Full export methodology"):
            method_file = DATA_ROOT / "methods.md"
            if method_file.exists():
                st.markdown(method_file.read_text(encoding="utf-8"))
        st.subheader("Paper figures and tables")
        st.markdown("Interactive charts can be exported with their chart toolbar. The publication bundle is the full exported selection; it does not change with dashboard filters.")
        publication = DATA_ROOT / "publication"
        if publication.exists():
            assets = sorted(path for path in publication.rglob("*") if path.suffix in {".pdf", ".svg", ".png", ".md", ".tex"})
            if assets:
                selected_file = st.selectbox("Publication asset", [path.relative_to(publication).as_posix() for path in assets], key="asset")
                asset = publication / selected_file
                st.download_button("Download publication asset", asset.read_bytes(), asset.name, key="asset_download")
        st.caption("This descriptive dashboard alone does not demonstrate a guided-versus-unconstrained treatment effect or establish deployment readiness.")


if __name__ == "__main__":
    main()
