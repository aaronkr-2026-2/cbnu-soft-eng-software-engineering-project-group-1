#!/usr/bin/env python3
"""
repo_stats.py - Git, documentation and AI collaboration statistics for MedConnect.

Python 3.8+, git; matplotlib is optional when --no-figures is used.
    python3 repo_stats.py .
    python3 repo_stats.py . --since 2026-09-01 --no-figures
    python3 repo_stats.py . --out /tmp/medconnect-analysis
    python3 repo_stats.py . --event 2026-10-15 "Applied SE principles"

Output defaults to <repo>/analysis/. Existing root commits.csv, weekly.csv,
ai_log.csv, table1.md, fig1_churn.png, fig2_ai_tasks.png and fig3_commits.png
remain combined reports. combined/, backend/, next/, shared/ and legacy_frontend/
contain scoped reports with code/non-code churn, current document inventory,
dated log activity, approximate text-token sizes, plan items and overlap candidates.
comparison.md and weekly_comparison.png compare applications; methods.md explains
all definitions, counting rules, exclusions, estimates and evidence limitations.

AI logs are auto-discovered in backend/, next/ and the root, or overridden using
repeated --ai-log PATH arguments. Dated records use YYYY-MM-DD. Local ignored
Markdown notes are included. --since filters commits by author date and dated
notes, not the current document inventory or undated plan items.

Code extensions, path-based scope mapping, exclusions, AI patterns, tools and task
keywords are editable below. Token sizes use ceil(characters / 4), not actual AI
usage. Recorded statuses/keyword mentions require review and do not prove impact.

Use with your team's agreement. Author names are pseudonymized, but exported
subjects, note titles and plan items may still contain identifying information.
"""
import argparse, csv, datetime as dt, math, os, re, statistics, subprocess, sys
from collections import Counter, defaultdict
from pathlib import Path

# ---------- things you may want to edit ----------
EXCLUDE = [r"(^|/)node_modules/", r"(^|/)dist/", r"(^|/)build/", r"(^|/)\.next/",
           r"(^|/)venv/", r"(^|/)\.venv/", r"package-lock\.json$", r"yarn\.lock$",
           r"pnpm-lock\.yaml$", r"poetry\.lock$", r"\.min\.(js|css)$", r"(^|/)analysis/"]
AI_PATTERNS = [r"co-authored-by:.*(claude|anthropic|copilot|cursor|gemini|chatgpt|openai|codex|windsurf)",
               r"\[ai\]", r"\(ai\)", r"ai-assisted", r"generated (by|with)", r"🤖"]
TASK_TYPES = [  # (label, keywords) - first match wins, so order matters
    ("Debug / fix", ["fix", "bug", "error", "debug", "crash", "broken", "issue"]),
    ("Refactor / clean", ["refactor", "clean", "rename", "lint", "format", "simplify"]),
    ("Test", ["test", "pytest", "jest", "coverage"]),
    ("Explain / learn", ["explain", "understand", "learn", "why", "how does"]),
    ("Docs", ["readme", "doc", "comment", "documentation"]),
    ("Generate feature", ["add", "create", "generate", "build", "implement", "feature", "new"]),
]
TOOLS = ["claude", "chatgpt", "gemini", "copilot", "cursor", "codex", "windsurf"]
SCOPES = {"combined": "Combined repository", "backend": "Backend (NestJS)",
          "next": "Frontend (Next.js)", "shared": "Shared / other",
          "legacy_frontend": "Legacy frontend (frontend/)"}
CODE_EXTENSIONS = set(".ts .tsx .js .jsx .mjs .cjs .mts .cts .py .sh .bash .html .htm .css .scss .sass .less .vue .svelte .graphql .gql .sql .prisma .java .kt .go .rs .c .h .cpp .hpp .cs .rb .php .swift .r .lua".split())
METRICS = ["files", "added", "deleted", "churn", "code_added", "code_deleted",
           "code_churn", "non_code_added", "non_code_deleted", "non_code_churn"]
COMMIT_FIELDS = ["hash", "date", "week", "author", "ai", *METRICS, "subject"]
WEEK_FIELDS = ["week", "commits", "ai_commits", *METRICS]
DATE_RE = re.compile(r"\b(20\d\d-\d\d-\d\d)\b")
# --------------------------------------------------


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit("git error: " + r.stderr.strip())
    return r.stdout


def week_start(d):
    return d - dt.timedelta(days=d.weekday())  # Monday of that week


def excluded(path):
    return (any(p in {".git", ".worktrees", "coverage", "__pycache__", ".venv", "venv",
                      "node_modules", "dist", "build", ".next"} for p in Path(path).parts)
            or path.endswith(".tsbuildinfo") or any(re.search(p, path) for p in EXCLUDE))


def scope_for(path):
    first = path.split("/")[0]
    return {"backend": "backend", "next": "next", "frontend": "legacy_frontend"}.get(first, "shared")


def line_kind(path):
    return "code" if Path(path).suffix.lower() in CODE_EXTENSIONS else "non_code"


def empty_metrics():
    return dict.fromkeys(METRICS, 0)


def read_commits(repo, since):
    # Filter author dates ourselves: Git --since uses committer dates and may prune history.
    extra = []
    # pass 1: metadata (fields separated by 0x1f, commits by 0x1e)
    meta_raw = git(repo, "log", "--no-merges", *extra,
                   "--pretty=format:%H%x1f%ad%x1f%aN%x1f%s%x1f%b%x1e", "--date=short")
    commits, order = {}, []
    for rec in meta_raw.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        h, date, author, subj, body = (rec.split("\x1f") + [""] * 5)[:5]
        text = (subj + "\n" + body).lower()
        commits[h] = dict(hash=h[:8], date=date, author=author, subject=subj,
                          ai=int(any(re.search(p, text) for p in AI_PATTERNS)),
                          **empty_metrics(), scopes={})
        order.append(h)
    # pass 2: line counts
    # NUL paths support spaces, tabs and non-ASCII filenames. Renames are deliberately
    # counted as deletion + addition, including moves across application boundaries.
    num_raw = git(repo, "log", "--no-merges", *extra, "--no-renames", "--numstat", "-z",
                  "--pretty=format:@@%H%x00")
    cur = None
    for line in num_raw.split("\0"):
        line = line.lstrip("\n")
        if line.startswith("@@"):
            cur = commits.get(line[2:].strip())
            continue
        parts = line.split("\t", 2)
        if cur is None or len(parts) != 3 or parts[0] == "-":  # "-" = binary file
            continue
        if excluded(parts[2]):
            continue
        kind = line_kind(parts[2])
        scoped = cur["scopes"].setdefault(scope_for(parts[2]), empty_metrics())
        for target in (cur, scoped):
            target["files"] += 1
            for metric, value in (("added", int(parts[0])), ("deleted", int(parts[1]))):
                target[metric] += value
                target[kind + "_" + metric] += value
            target["churn"] = target["added"] + target["deleted"]
            target[kind + "_churn"] = target[kind + "_added"] + target[kind + "_deleted"]
    rows = sorted((commits[h] for h in reversed(order)), key=lambda c: c["date"])  # oldest first
    devs = {}
    for c in rows:
        devs.setdefault(c["author"], f"Dev{len(devs) + 1}")
        c["author"] = devs[c["author"]]
        c["churn"] = c["added"] + c["deleted"]
        c["week"] = week_start(dt.date.fromisoformat(c["date"])).isoformat()
    rows = [c for c in rows if not since or c["date"] >= since]
    return rows, len({c["author"] for c in rows})


def dated_entries(path):
    """Parse dated headings, list notes and table rows from current local Markdown.

    A note inherits its heading's date. Undated headings end the previous note;
    fenced code is never interpreted as a new entry. Dates inside prose/fields
    do not start entries. Invalid calendar dates are ignored.
    """
    entries, cur, fence = [], None, None
    lines = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    # Current context often repeats historical events. Prefer the explicit history
    # section when the session log has one, retaining original source line numbers.
    history = next((i for i, line in enumerate(lines) if re.match(r"^#+\s+History\s*$", line, re.I)), None)
    start = history + 1 if Path(path).name.upper() == "SESSION_LOG.MD" and history is not None else 0
    for number, line in enumerate(lines[start:], start + 1):
        stripped = line.lstrip()
        marker = re.match(r"(`{3,}|~{3,})", stripped)
        if marker:
            if fence is None:
                fence = marker.group(1)[0]
            elif marker.group(1)[0] == fence:
                fence = None
            if cur:
                cur["text"] += "\n" + line
            continue
        heading = fence is None and re.match(r"#{1,6}\s+", stripped)
        boundary = fence is None and (heading or re.match(r"(?:[-*+]\s+|\d+[.)]\s+)(?:20\d\d-\d\d-\d\d\b)", stripped)
                                     or stripped.startswith("|"))
        m = DATE_RE.search(line) if boundary else None
        if m:
            try:
                dt.date.fromisoformat(m.group(1))
            except ValueError:
                m = None
        if m:
            cur = dict(date=m.group(1), title=stripped.strip("# "), text=line,
                       line=number)
            entries.append(cur)
        elif heading:
            cur = None
        elif cur is not None:
            cur["text"] += "\n" + line
    return entries


def keyword_match(text, keyword):
    return re.search(r"(?<!\w)" + re.escape(keyword) + r"(?!\w)", text, re.I) is not None


def read_ai_log(path, since=None, source=None):
    if not os.path.isfile(path):
        return []
    out = []
    for e in dated_entries(path):
        if since and e["date"] < since:
            continue
        # Reflection and verification boilerplate must not override task intent.
        request = re.search(r"\*\*What I asked for:\*\*\s*(.*?)(?=\n\s*\*\*|\Z)",
                            e["text"], re.S | re.I)
        intent = e["title"] + " " + (request.group(1) if request else "")
        task = next((lab for lab, kws in TASK_TYPES if any(keyword_match(intent, k) for k in kws)), "Other")
        field = re.search(r"\*\*Tool\(s\) used:\*\*\s*(.*?)(?=\n\s*\*\*|\Z)",
                          e["text"], re.S | re.I)
        tools = ";".join(x for x in TOOLS if keyword_match(field.group(1) if field else e["text"], x))
        out.append(dict(date=e["date"], week=week_start(dt.date.fromisoformat(e["date"])).isoformat(),
                        task_type=task, tool=tools or "unknown", preview=e["title"][:70],
                        source=source or str(path), scope=scope_for(source or str(path)), line=e["line"]))
    return out


def weekly(rows):
    w = defaultdict(lambda: dict(commits=0, ai_commits=0, **empty_metrics()))
    for c in rows:
        x = w[c["week"]]
        x["commits"] += 1; x["ai_commits"] += c["ai"]
        for metric in METRICS:
            x[metric] += c.get(metric, 0)
    if not w:
        return []
    weeks, d = [], dt.date.fromisoformat(min(w))
    last = dt.date.fromisoformat(max(w))
    while d <= last:  # include empty weeks so the time axis is honest
        k = d.isoformat()
        weeks.append(dict(week=k, **w[k]) if k in w else
                      dict(week=k, commits=0, ai_commits=0, **empty_metrics()))
        d += dt.timedelta(days=7)
    return weeks


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        wr.writeheader(); wr.writerows(rows)


def table1(rows, ndev, weeks, log):
    added = sum(c["added"] for c in rows); deleted = sum(c["deleted"] for c in rows)
    ai = sum(c["ai"] for c in rows)
    lines = [
        "TABLE I. DATASET SUMMARY", "",
        "| Measure | Value |", "|---|---|",
        f"| Period | {rows[0]['date'] + ' to ' + rows[-1]['date'] if rows else 'No commits'} ({len(weeks)} weeks) |",
        f"| Developers | {ndev} |",
        f"| Commits (no merges) | {len(rows)} |",
        f"| AI-tagged commits | {ai} ({100 * ai / len(rows) if rows else 0:.0f}%) |",
        f"| Lines added / deleted | {added:,} / {deleted:,} |",
        f"| Median churn per commit | {statistics.median([c['churn'] for c in rows]) if rows else 0:,} lines |",
        f"| Code churn | {sum(c.get('code_churn', 0) for c in rows):,} |",
        f"| Non-code churn | {sum(c.get('non_code_churn', 0) for c in rows):,} |",
        f"| AI_LOG.md entries | {len(log)} |",
    ]
    return "\n".join(lines) + "\n"


def figures(out, weeks, log, events):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 8, "font.family": "serif", "axes.spines.top": False,
                         "axes.spines.right": False, "savefig.dpi": 300})
    W = 3.5  # IEEE single-column width in inches
    # Fig. 2 AI_LOG entries by task type, sorted
    if log:
        cnt = Counter(e["task_type"] for e in log).most_common()[::-1]
        fig, ax = plt.subplots(figsize=(W, 0.4 + 0.28 * len(cnt)))
        ax.barh([k for k, _ in cnt], [v for _, v in cnt], color="0.35")
        for i, (_, v) in enumerate(cnt):
            ax.text(v + 0.2, i, str(v), va="center", fontsize=7)
        ax.set_xlabel("AI_LOG.md entries"); ax.spines["left"].set_visible(False)
        ax.tick_params(axis="y", length=0)
        fig.tight_layout(); fig.savefig(os.path.join(out, "fig2_ai_tasks.png")); plt.close(fig)

    if not weeks:
        return
    labels = [str(i + 1) for i in range(len(weeks))]  # week 1, 2, 3, ...
    xlabel = f"Week (week 1 starts {weeks[0]['week']})"
    x = list(range(len(weeks)))
    step = max(1, -(-len(x) // 12))

    def add_events(ax):
        for date, text in events:
            k = week_start(dt.date.fromisoformat(date)).isoformat()
            if k in [w["week"] for w in weeks]:
                i = [w["week"] for w in weeks].index(k)
                ax.axvline(i, color="0.4", ls="--", lw=0.8)
                ax.text(i + 0.15, ax.get_ylim()[1] * 0.95, text, fontsize=7, va="top")

    # Fig. 1 churn per week
    fig, ax = plt.subplots(figsize=(W, 2.2))
    ax.stackplot(x, [w["code_churn"] for w in weeks],
                 [w["non_code_churn"] for w in weeks],
                 labels=["Code", "Non-code"], colors=["0.3", "0.75"])
    ax.plot(x, [w["churn"] for w in weeks], color="black", lw=0.8)
    ax.legend(frameon=False, fontsize=7)
    ax.set_ylim(0, max(1, max(w["churn"] for w in weeks)) * 1.15)
    ax.set_xticks(x[::step]); ax.set_xticklabels(labels[::step])
    ax.set_xlabel(xlabel); ax.set_ylabel("Churn (lines added + deleted)")
    ax.grid(axis="y", color="0.9", lw=0.5)
    add_events(ax)
    fig.tight_layout(); fig.savefig(os.path.join(out, "fig1_churn.png")); plt.close(fig)

    # Fig. 3 AI-tagged vs other commits per week (grouped bars, hatch = not color alone)
    fig, ax = plt.subplots(figsize=(W, 2.2))
    ai = [w["ai_commits"] for w in weeks]; other = [w["commits"] - w["ai_commits"] for w in weeks]
    ax.bar([i - 0.2 for i in x], other, 0.4, color="white", edgecolor="black", lw=0.6, label="Other commits")
    ax.bar([i + 0.2 for i in x], ai, 0.4, color="0.3", edgecolor="black", lw=0.6, hatch="///", label="AI-tagged")
    ax.set_xticks(x[::step]); ax.set_xticklabels(labels[::step])
    ax.set_xlabel(xlabel); ax.set_ylabel("Commits")
    ax.set_ylim(0, max(1, max(w["commits"] for w in weeks)) * 1.2)
    ax.legend(frameon=False, fontsize=7, ncol=2, loc="lower center", bbox_to_anchor=(0.5, 1.0))
    add_events(ax)
    fig.tight_layout(); fig.savefig(os.path.join(out, "fig3_commits.png")); plt.close(fig)


def document_type(path):
    name = Path(path).stem.lower().replace("-", "_")
    if name == "session_log":
        return "Session log"
    if name == "ai_log":
        return "AI log"
    if name == "agents":
        return "Agent instructions"
    if "future" in name or "improvement" in name:
        return "Future improvements"
    if "plan" in name:
        return "Plan"
    if "sprint" in name:
        return "Sprint record"
    return "Project documentation"


def estimate_tokens(text):
    # Deliberately dependency-free. A text-size proxy, not provider accounting.
    return math.ceil(len(text) / 4)


def markdown_files(repo, out):
    """Include local ignored notes, but never dependencies, worktrees or outputs."""
    root, output = Path(repo).resolve(), Path(out).resolve()
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".")
                         and not Path(directory, d).is_symlink()
                         and not excluded(Path(directory, d).relative_to(root).as_posix() + "/")
                         and Path(directory, d).resolve() != output)
        for filename in sorted(files):
            path = Path(directory, filename)
            if path.is_symlink() or path.suffix.lower() not in {".md", ".mdx"}:
                continue
            relative = path.relative_to(root).as_posix()
            if not excluded(relative) and output not in path.parents:
                yield relative, path


def read_documents(repo, out, since):
    documents, notes, items = [], [], []
    tracked = set(git(repo, "ls-files", "-z").split("\0"))
    for source, path in markdown_files(repo, out):
        text = path.read_text(encoding="utf-8", errors="replace")
        category, scope = document_type(source), scope_for(source)
        base = dict(source=source, scope=scope, category=category)
        documents.append(dict(**base, tracked=int(source in tracked), lines=len(text.splitlines()),
                              characters=len(text), estimated_tokens=estimate_tokens(text)))
        # Date-based activity is counted for logs only: a date mentioned in a plan
        # is not evidence that a work session happened on that date.
        if category in {"Session log", "AI log"}:
            for entry in dated_entries(path):
                if since and entry["date"] < since:
                    continue
                body = entry["text"]
                notes.append(dict(**base, date=entry["date"],
                                  week=week_start(dt.date.fromisoformat(entry["date"])).isoformat(),
                                  line=entry["line"], title=entry["title"],
                                  estimated_tokens=estimate_tokens(body),
                                  decision_mentions=int(bool(re.search(r"\b(decid\w*|decision\w*|kept|rejected)\b", body, re.I))),
                                  correction_mentions=int(bool(re.search(r"\b(correct\w*|mistake\w*|wrong|caught)\b", body, re.I))),
                                  verification_mentions=int(bool(re.search(r"\b(verif\w*|passed|failed|tests?)\b", body, re.I)))))
        if category not in {"Plan", "Future improvements", "Sprint record"}:
            continue
        for line_number, line in enumerate(text.splitlines(), 1):
            checkbox = re.match(r"\s*[-*+]\s+\[([ xX])\]\s+(.*)", line)
            roadmap = re.match(r"\s*\|\s*(FI-\d+)\s*\|", line)
            if not checkbox and not roadmap:
                continue
            status = "Checked (self-reported)" if checkbox and checkbox.group(1).strip() else "Unchecked"
            if roadmap:
                status = next((label for label in ("Completed", "In progress", "Planned", "Backlog")
                               if re.search(r"\*\*" + label + r"\*\*", line, re.I)), "Unknown")
            # Export references for review; neither a checkbox nor a file path proves delivery.
            hashes = re.findall(r"(?<![\w/])(?:[0-9a-f]{7,40})(?![\w/])", line)
            paths = re.findall(r"`([^`]+\.[A-Za-z0-9]+)`|\]\(([^)]+)\)", line)
            references = hashes + [a or b for a, b in paths]
            items.append(dict(**base, line=line_number, item_id=roadmap.group(1) if roadmap else "",
                              recorded_status=status, item=line.strip(),
                              references=";".join(references), evidence_status="Needs manual verification"))
    return documents, notes, items


def overlapping_notes(notes):
    """Candidates only. Related AI/session entries are never summed as unique tasks."""
    grouped = defaultdict(list)
    for n in notes:
        grouped[n["scope"], n["date"]].append(n)
    overlaps = []
    for group in grouped.values():
        for a in (n for n in group if n["category"] == "AI log"):
            for b in (n for n in group if n["category"] == "Session log"):
                def words(n):
                    title = DATE_RE.sub("", n["title"]).lower()
                    return set(re.findall(r"[a-z0-9]+", title)) - {"the", "and", "for", "with"}
                left, right = words(a), words(b)
                score = len(left & right) / max(1, len(left | right))
                if score >= 0.5:
                    overlaps.append(dict(scope=a["scope"], date=a["date"], ai_source=a["source"],
                                         ai_line=a["line"], session_source=b["source"], session_line=b["line"],
                                         title_similarity=round(score, 3), status="Possible same work; review manually"))
    return overlaps


def document_weekly(notes):
    counts = defaultdict(lambda: dict(session_entries=0, ai_entries=0, estimated_note_tokens=0,
                                     decision_mentions=0, correction_mentions=0, verification_mentions=0))
    for n in notes:
        count = counts[n["week"]]
        count["session_entries" if n["category"] == "Session log" else "ai_entries"] += 1
        count["estimated_note_tokens"] += n["estimated_tokens"]
        for metric in ("decision_mentions", "correction_mentions", "verification_mentions"):
            count[metric] += n[metric]
    if not counts:
        return []
    out, cumulative = [], 0
    current = dt.date.fromisoformat(min(counts))
    last = dt.date.fromisoformat(max(counts))
    while current <= last:
        key = current.isoformat()
        cumulative += counts[key]["estimated_note_tokens"]
        out.append(dict(week=key, **counts[key], cumulative_recorded_note_tokens=cumulative))
        current += dt.timedelta(days=7)
    return out


def scoped_commits(rows, scope):
    if scope == "combined":
        return rows
    return [dict(c, **c["scopes"][scope]) for c in rows if scope in c["scopes"]]


def write_document_reports(out, documents, notes, items):
    write_csv(out / "documents.csv", documents,
              ["source", "scope", "category", "tracked", "lines", "characters", "estimated_tokens"])
    write_csv(out / "dated_notes.csv", notes,
              ["source", "scope", "category", "date", "week", "line", "title", "estimated_tokens",
               "decision_mentions", "correction_mentions", "verification_mentions"])
    write_csv(out / "plan_items.csv", items,
              ["source", "scope", "category", "line", "item_id", "recorded_status", "item", "references", "evidence_status"])
    write_csv(out / "document_weekly.csv", document_weekly(notes),
              ["week", "session_entries", "ai_entries", "estimated_note_tokens", "cumulative_recorded_note_tokens",
               "decision_mentions", "correction_mentions", "verification_mentions"])
    write_csv(out / "log_overlap_candidates.csv", overlapping_notes(notes),
              ["scope", "date", "ai_source", "ai_line", "session_source", "session_line", "title_similarity", "status"])
    summary = ["# Document and AI collaboration analysis", "",
               "| Category | Current files | Current estimated text tokens | Selected dated notes |",
               "|---|---:|---:|---:|"]
    for category in sorted({d["category"] for d in documents}):
        docs = [d for d in documents if d["category"] == category]
        summary.append(f"| {category} | {len(docs)} | {sum(d['estimated_tokens'] for d in docs):,} | "
                       f"{sum(n['category'] == category for n in notes)} |")
    summary += ["", "## Recorded plan and roadmap statuses", "",
                "| Recorded status | Items (not necessarily distinct work) |", "|---|---:|"]
    for status, count in sorted(Counter(item["recorded_status"] for item in items).items()):
        summary.append(f"| {status} | {count} |")
    summary += ["", f"Possible AI/session overlaps: {len(overlapping_notes(notes))}. See log_overlap_candidates.csv.", ""]
    summary += ["", "Token estimate: ceil(characters / 4), a coarse text-size heuristic, not a tokenizer or API usage measurement.",
                "Current-file inventory is not date-filtered. Dated notes are filtered; their current text is attributed to the recorded date.",
                "Cumulative note size describes surviving recorded text in the selected period, not historical file size or actual loaded context.",
                "Session and AI entries are separate record counts, never a combined unique-task count. Overlap candidates require review.",
                "Mention columns are keyword flags, including negative statements and templates; they are not counts of confirmed mistakes or outcomes.",
                "Plan statuses and checkboxes are self-reported. References are review candidates, not proof of implementation or causal impact.",
                "Ignored local Markdown is included; results may differ between checkouts. No raw note bodies are exported."]
    (out / "document_summary.md").write_text("\n".join(summary) + "\n", encoding="utf-8")


def comparison_figure(out, reports):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7, 3))
    for scope in ("combined", "backend", "next", "shared", "legacy_frontend"):
        weeks = reports[scope][1]
        if weeks:
            ax.plot([dt.date.fromisoformat(w["week"]) for w in weeks],
                    [w["churn"] for w in weeks], label=SCOPES[scope], lw=1)
    ax.set_ylabel("Churn (lines added + deleted)")
    ax.set_xlabel("Week starting Monday")
    ax.legend(frameon=False, fontsize=7)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out / "weekly_comparison.png", dpi=300)
    plt.close(fig)


def valid_date(value):
    try:
        return dt.date.fromisoformat(value).isoformat()
    except ValueError:
        raise argparse.ArgumentTypeError("Expected a valid date in YYYY-MM-DD format")


METHODS = """# Repository analysis methods

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
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo", nargs="?", default=".")
    ap.add_argument("--out", help="output folder (default: <repo>/analysis)")
    ap.add_argument("--ai-log", action="append", help="repo-relative AI log; repeat to override automatic discovery")
    ap.add_argument("--since", type=valid_date, help="include author dates and note dates on/after YYYY-MM-DD")
    ap.add_argument("--event", nargs=2, action="append", default=[], metavar=("DATE", "LABEL"),
                    help='mark a date on the figures, e.g. --event 2026-10-15 "SE principles"')
    ap.add_argument("--no-figures", action="store_true")
    a = ap.parse_args()
    for date, _ in a.event:
        try:
            valid_date(date)
        except argparse.ArgumentTypeError as error:
            ap.error(str(error))
    repo = Path(a.repo).resolve()
    out = Path(a.out).resolve() if a.out else repo / "analysis"
    if out == repo or out in repo.parents or out in [repo / name for name in ("backend", "next", "docs", "frontend")]:
        ap.error("Choose a dedicated output directory, such as <repo>/analysis")
    out.mkdir(parents=True, exist_ok=True)
    rows, _ = read_commits(str(repo), a.since)
    log_paths = a.ai_log if a.ai_log is not None else ["backend/AI_LOG.md", "next/AI_LOG.md", "AI_LOG.md"]
    logs, seen = [], set()
    for source in log_paths:
        path = (repo / source).resolve()
        if repo not in path.parents:
            ap.error("--ai-log must point to a file inside the repository")
        if path in seen:
            continue
        seen.add(path)
        if a.ai_log is not None and not path.is_file():
            ap.error(f"AI log not found: {source}")
        logs.extend(read_ai_log(path, a.since, path.relative_to(repo).as_posix()))
    documents, notes, items = read_documents(repo, out, a.since)
    reports = {}
    comparison = ["# Application comparison", "",
                  "| Scope | Commits | Contributors | Added | Deleted | Code churn | Non-code churn | AI-tagged | AI log entries |",
                  "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for scope, label in SCOPES.items():
        scoped = scoped_commits(rows, scope)
        weeks = weekly(scoped)
        log = [entry for entry in logs if scope == "combined" or entry["scope"] == scope]
        reports[scope] = (scoped, weeks)
        destination = out / scope
        destination.mkdir(exist_ok=True)
        targets = [destination, out] if scope == "combined" else [destination]
        for target in targets:
            # A new date filter or --no-figures must not leave old charts posing
            # as results from the current run. Only remove our named outputs.
            for filename in ("fig1_churn.png", "fig2_ai_tasks.png", "fig3_commits.png"):
                chart = target / filename
                if chart.exists():
                    chart.unlink()
            write_csv(target / "commits.csv", scoped, COMMIT_FIELDS)
            write_csv(target / "weekly.csv", weeks, WEEK_FIELDS)
            write_csv(target / "ai_log.csv", log, ["date", "week", "task_type", "tool", "preview", "source", "scope", "line"])
            summary = table1(scoped, len({c["author"] for c in scoped}), weeks, log)
            (target / "table1.md").write_text(summary, encoding="utf-8")
            write_document_reports(target,
                                   [d for d in documents if scope == "combined" or d["scope"] == scope],
                                   [n for n in notes if scope == "combined" or n["scope"] == scope],
                                   [i for i in items if scope == "combined" or i["scope"] == scope])
            if not a.no_figures:
                figures(target, weeks, log, a.event)
        totals = {key: sum(c[key] for c in scoped) for key in METRICS}
        comparison.append(f"| {label} | {len(scoped)} | {len({c['author'] for c in scoped})} | "
                          f"{totals['added']:,} | {totals['deleted']:,} | {totals['code_churn']:,} | "
                          f"{totals['non_code_churn']:,} | {sum(c['ai'] for c in scoped)} | {len(log)} |")
    comparison += ["", "See [methods](methods.md) for definitions and limitations. Commit/contributor counts overlap across scopes."]
    (out / "comparison.md").write_text("\n".join(comparison) + "\n", encoding="utf-8")
    (out / "methods.md").write_text(METHODS, encoding="utf-8")
    comparison_chart = out / "weekly_comparison.png"
    if comparison_chart.exists():
        comparison_chart.unlink()
    if not a.no_figures and any(weeks for _, weeks in reports.values()):
        comparison_figure(out, reports)
    print("\n".join(comparison))
    print(f"Saved reports in: {out}")
    if not rows:
        print("No matching commits; current documents and dated records were still analyzed.")


if __name__ == "__main__":
    main()
