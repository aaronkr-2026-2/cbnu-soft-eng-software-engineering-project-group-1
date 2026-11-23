#!/usr/bin/env python3
"""Create research figures and tables from repo_stats.py CSV exports.

Python 3.8+ and matplotlib. No Git access, network, or AI service is required.
Defaults: read CSVs beside this script; write figures/, tables/, captions.md,
and manifest.json under publication/. Existing CSVs are never changed.

    python3 generate_figures.py
    python3 generate_figures.py --data-dir /path/to/analysis --out /tmp/figures
    python3 generate_figures.py --formats png pdf svg
"""

import argparse
from collections import Counter, defaultdict
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import statistics
import sys
import tempfile


SCOPES = {
    "backend": "Backend (NestJS)",
    "next": "Frontend (Next.js)",
    "shared": "Shared / other",
    "legacy_frontend": "Legacy frontend",
}
METRICS = ("added", "deleted", "churn", "code_added", "code_deleted", "code_churn",
           "non_code_added", "non_code_deleted", "non_code_churn")


def read_csv(root, name, required, numeric=()):
    path = root / name
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = set(required) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{name}: missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    for number, row in enumerate(rows, 2):
        for key in numeric:
            try:
                row[key] = int(row[key])
            except (ValueError, TypeError):
                raise ValueError(f"{name}:{number}: {key} must be an integer")
            if row[key] < 0:
                raise ValueError(f"{name}:{number}: {key} must be nonnegative")
        for key in ("date", "week"):
            if key in required:
                try:
                    value = dt.date.fromisoformat(row[key])
                except (ValueError, TypeError):
                    raise ValueError(f"{name}:{number}: invalid {key}")
                if key == "week" and value.weekday() != 0:
                    raise ValueError(f"{name}:{number}: week must start on Monday")
        if "date" in required and "week" in required:
            day = dt.date.fromisoformat(row["date"])
            if (day - dt.timedelta(days=day.weekday())).isoformat() != row["week"]:
                raise ValueError(f"{name}:{number}: date does not belong to week")
    return rows


def totals(rows):
    return {key: sum(row[key] for row in rows) for key in METRICS}


def validate_churn(rows, source):
    for row in rows:
        for prefix in ("", "code_", "non_code_"):
            if row[prefix + "added"] + row[prefix + "deleted"] != row[prefix + "churn"]:
                raise ValueError(f"{source}: added + deleted does not equal churn")
        for suffix in ("added", "deleted", "churn"):
            if row["code_" + suffix] + row["non_code_" + suffix] != row[suffix]:
                raise ValueError(f"{source}: code + non-code does not equal total")


def validate_commits(rows, source):
    if len({row["hash"] for row in rows}) != len(rows):
        raise ValueError(f"{source}: duplicate commit hashes")
    if any(row["ai"] not in (0, 1) for row in rows):
        raise ValueError(f"{source}: ai must be 0 or 1")
    validate_churn(rows, source)


def load_data(root):
    """Check accounting before producing any output; never silently fill missing data."""
    commit_fields = ("hash", "date", "week", "author", "ai", *METRICS)
    commit_numeric = ("ai", *METRICS)
    commits = read_csv(root, "commits.csv", commit_fields, commit_numeric)
    validate_commits(commits, "commits.csv")
    if not commits:
        raise ValueError("commits.csv is empty; choose a period containing commits")
    weeks = read_csv(root, "weekly.csv", ("week", "commits", "ai_commits", *METRICS),
                     ("commits", "ai_commits", *METRICS))
    validate_churn(weeks, "weekly.csv")
    weeks.sort(key=lambda row: row["week"])
    if len({row["week"] for row in weeks}) != len(weeks):
        raise ValueError("weekly.csv: duplicate weeks")
    if weeks:
        first, last = (dt.date.fromisoformat(weeks[i]["week"]) for i in (0, -1))
        expected = [(first + dt.timedelta(weeks=i)).isoformat()
                    for i in range((last - first).days // 7 + 1)]
        if [row["week"] for row in weeks] != expected:
            raise ValueError("weekly.csv: missing weeks; include zero-activity weeks")
    grouped = defaultdict(list)
    for row in commits:
        grouped[row["week"]].append(row)
    if set(grouped) - {row["week"] for row in weeks}:
        raise ValueError("weekly.csv: a commit week is missing")
    for week in weeks:
        records = grouped[week["week"]]
        if (totals(records) != {key: week[key] for key in METRICS}
                or week["commits"] != len(records)
                or week["ai_commits"] != sum(row["ai"] for row in records)):
            raise ValueError(f"weekly.csv: totals differ from commits for {week['week']}")
    scoped = {}
    parent = {row["hash"]: row for row in commits}
    partition = defaultdict(lambda: dict.fromkeys(METRICS, 0))
    for scope in SCOPES:
        name = scope + "/commits.csv"
        scoped[scope] = read_csv(root, name, commit_fields, commit_numeric)
        validate_commits(scoped[scope], name)
        for row in scoped[scope]:
            original = parent.get(row["hash"])
            if original is None:
                raise ValueError(f"{name}: commit absent from combined data")
            if any(row[key] != original[key] for key in ("date", "week", "author", "ai")):
                raise ValueError(f"{name}: commit metadata differs from combined data")
            for key in METRICS:
                partition[row["hash"]][key] += row[key]
    if any(partition[row["hash"]] != {key: row[key] for key in METRICS} for row in commits):
        raise ValueError("Scoped line counts do not reconcile with combined commits")
    logs = read_csv(root, "ai_log.csv", ("date", "week", "scope", "task_type"))
    docs = read_csv(root, "documents.csv", ("source", "scope", "category", "estimated_tokens"),
                    ("estimated_tokens",))
    if len({row["source"] for row in docs}) != len(docs):
        raise ValueError("documents.csv: duplicate source documents")
    activity = read_csv(root, "document_weekly.csv",
                        ("week", "session_entries", "ai_entries", "estimated_note_tokens",
                         "cumulative_recorded_note_tokens"),
                        ("session_entries", "ai_entries", "estimated_note_tokens", "cumulative_recorded_note_tokens"))
    activity.sort(key=lambda row: row["week"])
    notes = read_csv(root, "dated_notes.csv", ("source", "category", "date", "week", "estimated_tokens"),
                     ("estimated_tokens",))
    read_csv(root, "plan_items.csv", ("source", "line", "recorded_status"), ("line",))
    note_groups = defaultdict(list)
    for row in notes:
        if row["category"] not in {"AI log", "Session log"}:
            raise ValueError("dated_notes.csv: expected AI log or Session log category")
        note_groups[row["week"]].append(row)
    if set(note_groups) - {row["week"] for row in activity}:
        raise ValueError("document_weekly.csv: a dated-note week is missing")
    if len({row["week"] for row in activity}) != len(activity):
        raise ValueError("document_weekly.csv: duplicate weeks")
    cumulative = 0
    for row in activity:
        selected = note_groups[row["week"]]
        if (row["session_entries"] != sum(n["category"] == "Session log" for n in selected)
                or row["ai_entries"] != sum(n["category"] == "AI log" for n in selected)
                or row["estimated_note_tokens"] != sum(n["estimated_tokens"] for n in selected)):
            raise ValueError("document_weekly.csv: counts differ from dated_notes.csv")
        cumulative += row["estimated_note_tokens"]
        if row["cumulative_recorded_note_tokens"] != cumulative:
            raise ValueError("document_weekly.csv: cumulative note-token totals do not reconcile")
    return dict(commits=commits, weeks=weeks, scoped=scoped, logs=logs, docs=docs, activity=activity)


def markdown_table(headers, rows):
    def escape(value):
        return str(value).replace("|", "\\|").replace("\n", " ")
    return "\n".join(["| " + " | ".join(map(escape, headers)) + " |",
                       "| " + " | ".join("---" for _ in headers) + " |"] +
                      ["| " + " | ".join(map(escape, row)) + " |" for row in rows]) + "\n"


def latex_escape(value):
    replacements = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
                    "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
                    "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    return "".join(replacements.get(char, char) for char in str(value))


def latex_table(headers, rows):
    lines = [r"\begin{tabular}{" + "l" * len(headers) + "}", r"\hline"]
    lines.append(" & ".join(map(latex_escape, headers)) + r" \\")
    lines.append(r"\hline")
    lines.extend(" & ".join(map(latex_escape, row)) + r" \\" for row in rows)
    lines.extend([r"\hline", r"\end{tabular}"])
    return "\n".join(lines) + "\n"


def render_reports(data, root, out, formats):
    # A writable cache avoids changing user configuration on restricted hosts.
    os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "research-figures-mpl"))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

    plt.rcParams.update({"font.family": "serif", "font.size": 9, "axes.spines.top": False,
                         "axes.spines.right": False, "pdf.fonttype": 42, "svg.fonttype": "none",
                         "savefig.dpi": 300})
    entries = []
    for folder in ("figures", "tables"):
        (out / folder).mkdir(parents=True, exist_ok=True)

    def save(fig, folder, name, caption, sources):
        fig.tight_layout()
        for extension in formats:
            fig.savefig(out / folder / (name + "." + extension), bbox_inches="tight", facecolor="white")
        plt.close(fig)
        entries.append(dict(name=name, folder=folder, caption=caption, sources=sources,
                            files=[folder + "/" + name + "." + ext for ext in formats]))

    def date_axis(ax):
        locator = mdates.AutoDateLocator(minticks=4, maxticks=8)
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        ax.set_xlabel("Week starting Monday")
        ax.grid(axis="y", color="0.9", lw=0.5)
        ax.set_axisbelow(True)
        ax.set_ylim(bottom=0)

    weeks = data["weeks"]
    dates = [dt.date.fromisoformat(row["week"]) for row in weeks]
    fig, ax = plt.subplots(figsize=(7, 3.3))
    code = [row["code_churn"] for row in weeks]
    non_code = [row["non_code_churn"] for row in weeks]
    ax.bar(dates, code, width=5.5, label="Code", color="#335c81")
    ax.bar(dates, non_code, bottom=code, width=5.5, label="Non-code", color="0.75", hatch="//", edgecolor="0.4", lw=0.4)
    ax.set_ylabel("Churn (lines added + deleted)")
    ax.legend(frameon=False)
    date_axis(ax)
    save(fig, "figures", "fig1_code_non_code_churn",
         "Weekly combined churn split into code and non-code. Non-code includes Markdown, configuration and other included text; blanks and comments are counted. Churn measures changes, not current codebase size or productivity.", ["weekly.csv"])

    fig, ax = plt.subplots(figsize=(7, 3.3))
    for (scope, label), style, color in zip(SCOPES.items(), ("-", "--", ":", "-."),
                                          ("#335c81", "#9e4a27", "0.3", "#6b5b95")):
        sums = Counter()
        for row in data["scoped"][scope]:
            sums[row["week"]] += row["churn"]
        ax.plot(dates, [sums[row["week"]] for row in weeks], linestyle=style, color=color, label=label, lw=1.5)
    ax.set_ylabel("Churn (lines added + deleted)")
    ax.legend(frameon=False, fontsize=8)
    date_axis(ax)
    save(fig, "figures", "fig2_application_churn",
         "Weekly churn by path-based application scope on a common date axis. Zeroes include weeks before an application's first recorded change. Scope churn sums to combined churn; commit counts can overlap.",
         [scope + "/commits.csv" for scope in SCOPES])

    fig, ax = plt.subplots(figsize=(7, 3.3))
    tasks = sorted(Counter(row["task_type"] for row in data["logs"]).items(), key=lambda item: item[1])
    if tasks:
        labels, counts = zip(*tasks)
        ax.barh(labels, counts, color="#335c81")
        ax.set_xlim(0, max(counts) * 1.18)
        for index, count in enumerate(counts):
            ax.text(count + max(counts) * 0.02, index, str(count), va="center", fontsize=8)
    else:
        ax.text(0.5, 0.5, "No dated AI log entries", transform=ax.transAxes, ha="center")
    ax.set_xlabel("AI log entries")
    save(fig, "figures", "fig3_ai_task_categories",
         "AI-log entries by automatically assigned task category. Categories are keyword heuristics and should be spot-checked against original requests. Entries are not necessarily unique tasks or AI conversations.", ["ai_log.csv"])

    size = Counter()
    for row in data["docs"]:
        size[row["category"]] += row["estimated_tokens"]
    fig, ax = plt.subplots(figsize=(7, 3.4))
    categories = sorted(size, key=size.get)
    ax.barh(categories, [size[label] / 1000 for label in categories], color="#335c81")
    ax.set_xlabel("Estimated text tokens (thousands; characters / 4)")
    save(fig, "figures", "fig4_document_text_size",
         "Estimated current document text size by category, including local ignored Markdown. Token estimates use ceil(characters / 4) per file. They are not actual model tokens, loaded context, API usage or costs, and are not historical snapshots.", ["documents.csv"])

    fig, ax = plt.subplots(figsize=(7, 3.3))
    activity = data["activity"]
    if activity:
        by_week = {row["week"]: row for row in activity}
        first, last = (dt.date.fromisoformat(activity[index]["week"]) for index in (0, -1))
        activity_dates = [first + dt.timedelta(weeks=i) for i in range((last - first).days // 7 + 1)]
        for column, label, offset, color in (("session_entries", "Session notes", -1.4, "#335c81"),
                                              ("ai_entries", "AI log entries", 1.4, "0.65")):
            ax.bar([dt.datetime.combine(day, dt.time()) + dt.timedelta(days=offset) for day in activity_dates],
                   [by_week.get(day.isoformat(), {}).get(column, 0) for day in activity_dates],
                   width=2.6, label=label, color=color)
        ax.legend(frameon=False)
        date_axis(ax)
    else:
        ax.text(0.5, 0.5, "No dated notes", transform=ax.transAxes, ha="center")
    ax.set_ylabel("Recorded entries")
    save(fig, "figures", "fig5_recorded_activity",
         "Weekly recorded session notes and AI-log entries, shown separately. Records may describe the same work and must not be summed as unique tasks. Activity is based on note dates, not historical file modifications or AI calls.", ["document_weekly.csv"])

    fig, ax = plt.subplots(figsize=(9, 2.8))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 3)
    ax.axis("off")
    labels = ("Plan / request\nPlans and roadmap", "AI-assisted work\nAI log records",
              "Human review\nDecisions / corrections", "Verification\nTests / recorded checks")
    centers = (1.15, 3.7, 6.25, 8.8)
    for center, label in zip(centers, labels):
        ax.add_patch(FancyBboxPatch((center - 1.05, 1.25), 2.1, 0.95, boxstyle="round,pad=0.05",
                                   facecolor="#edf2f6", edgecolor="#335c81", lw=1))
        ax.text(center, 1.725, label, ha="center", va="center", fontsize=9)
    for left, right in zip(centers, centers[1:]):
        ax.add_patch(FancyArrowPatch((left + 1.1, 1.725), (right - 1.1, 1.725),
                                    arrowstyle="-|>", mutation_scale=12, color="0.25"))
    ax.add_patch(FancyArrowPatch((6.25, 1.17), (3.7, 1.17), connectionstyle="arc3,rad=-0.4",
                                arrowstyle="-|>", mutation_scale=12, linestyle="--", color="0.35"))
    ax.text(4.975, 0.48, "Revise when review identifies an issue", ha="center", fontsize=8)
    ax.text(5, 2.75, "Illustrative workflow for reviewing case evidence", ha="center", fontsize=11)
    save(fig, "figures", "fig6_review_workflow",
         "Illustrative evidence-review workflow, not an automatically inferred sequence or a causal result. A case study must link dated plan/request, AI-assisted work, human review and verification records before claiming this sequence occurred. No counts are assigned to the arrows.",
         ["plan_items.csv", "dated_notes.csv"])

    def table(name, headers, rows, caption, sources, width):
        base = out / "tables" / name
        base.with_suffix(".md").write_text(markdown_table(headers, rows) + "\n" + caption + "\n", encoding="utf-8")
        base.with_suffix(".tex").write_text("% " + caption.replace("\n", " ") + "\n" + latex_table(headers, rows), encoding="utf-8")
        fig, ax = plt.subplots(figsize=(width, 0.5 + 0.37 * (len(rows) + 1)))
        ax.axis("off")
        display_headers = [header.replace(" ", "\n", 1) if len(header) > 12 else header for header in headers]
        rendered = ax.table(cellText=rows, colLabels=display_headers, loc="center", cellLoc="left", colLoc="left")
        rendered.auto_set_font_size(False)
        rendered.set_fontsize(8)
        rendered.auto_set_column_width(range(len(headers)))
        rendered.scale(1, 1.7)
        for (row, _), cell in rendered.get_celld().items():
            cell.set_edgecolor("0.8")
            cell.set_linewidth(0.4)
            if row == 0:
                cell.set_facecolor("#edf2f6")
                cell.set_text_props(weight="bold")
        save(fig, "tables", name, caption, sources)

    commits = data["commits"]
    aggregate = totals(commits)
    ordered_dates = sorted(row["date"] for row in commits)
    summary = [
        ["Commit period (author dates)", ordered_dates[0] + " to " + ordered_dates[-1]],
        ["Calendar weeks", f"{len(weeks):,}"],
        ["Non-merge commits", f"{len(commits):,}"],
        ["Author pseudonyms", f"{len({row['author'] for row in commits}):,}"],
        ["Lines added / deleted", f"{aggregate['added']:,} / {aggregate['deleted']:,}"],
        ["Code churn", f"{aggregate['code_churn']:,}"],
        ["Non-code churn", f"{aggregate['non_code_churn']:,}"],
        ["Non-code share of churn", f"{100 * aggregate['non_code_churn'] / aggregate['churn']:.1f}%" if aggregate["churn"] else "n.a."],
        ["Median churn per commit", f"{statistics.median(row['churn'] for row in commits):,}"],
        ["AI-tagged commits", f"{sum(row['ai'] for row in commits):,}"],
        ["Dated AI-log entries", f"{len(data['logs']):,}"],
        ["Dated session notes", f"{sum(row['session_entries'] for row in activity):,}"],
    ]
    table("table1_dataset", ["Measure", "Value"], summary,
          "Dataset summary for the exported selection. Authors are pseudonyms, not verified unique people. Log counts can overlap. Zero AI-tagged commits does not establish absence of AI use.",
          ["commits.csv", "weekly.csv", "ai_log.csv", "document_weekly.csv"], 7)
    rows = []
    for scope, label in [("combined", "Combined repository"), *SCOPES.items()]:
        records = commits if scope == "combined" else data["scoped"][scope]
        amount = totals(records)
        rows.append([label, f"{len(records):,}", f"{len({r['author'] for r in records}):,}",
                     f"{amount['code_churn']:,}", f"{amount['non_code_churn']:,}",
                     f"{sum(scope == 'combined' or r['scope'] == scope for r in data['logs']):,}"])
    table("table2_applications", ["Scope", "Commits", "Authors", "Code churn", "Non-code churn", "AI-log entries"], rows,
          "Application comparison. File paths assign scope. Cross-scope commits/authors overlap and must not be summed; churn partitions the combined total. Shared documents may concern both applications.",
          ["commits.csv", "ai_log.csv"] + [scope + "/commits.csv" for scope in SCOPES], 10)

    captions = ["# Figures and tables", "", "Generated from the existing CSV selection without modifying the inputs.", ""]
    for entry in entries:
        captions.extend(["## " + entry["name"], "", entry["caption"], "",
                         "Sources: " + ", ".join("`" + name + "`" for name in entry["sources"]) + ".", "",
                         "Files: " + ", ".join(f"[{name}]({name})" for name in entry["files"]), ""])
    (out / "captions.md").write_text("\n".join(captions), encoding="utf-8")
    sources = sorted({source for entry in entries for source in entry["sources"]})
    manifest = {"generator": "generate_figures.py",
                "generator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "formats": formats,
                "inputs": {name: {"sha256": hashlib.sha256((root / name).read_bytes()).hexdigest()}
                           for name in sources}, "outputs": entries,
                "checks": ["code + non-code equals total", "weekly totals reconcile to commits",
                           "scoped line metrics reconcile per combined commit", "cumulative note tokens reconcile"],
                "limitations": ["All figures describe the exported selection; no new date filtering is applied.",
                                "The workflow is illustrative; arrows do not establish causality.",
                                "Estimated text tokens do not measure actual AI consumption."]}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--out", type=Path, help="default: <data-dir>/publication")
    parser.add_argument("--formats", nargs="+", choices=("png", "pdf", "svg"), default=["png", "pdf", "svg"])
    args = parser.parse_args()
    root = args.data_dir.resolve()
    out = args.out.resolve() if args.out else root / "publication"
    if out == root or out in root.parents:
        parser.error("Choose a separate output folder, such as <data-dir>/publication")
    try:
        data = load_data(root)
        entries = render_reports(data, root, out, list(dict.fromkeys(args.formats)))
    except (OSError, ValueError) as error:
        parser.exit(1, f"Cannot generate reports: {error}\n")
    except ImportError:
        parser.exit(1, "matplotlib is required. Install with: python3 -m pip install matplotlib\n")
    print(f"Created 6 figures and 2 tables ({', '.join(dict.fromkeys(args.formats))}) in {out}")
    print("Table Markdown/LaTeX, captions.md and manifest.json were also written.")


if __name__ == "__main__":
    main()
