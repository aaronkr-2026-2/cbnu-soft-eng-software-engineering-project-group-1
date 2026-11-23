"""Data selection and accounting for the read-only research dashboard."""
from collections import Counter, defaultdict
import datetime as dt

from analysis.generate_figures import METRICS, SCOPES, load_data, read_csv


LABELS = {"combined": "Combined repository", **SCOPES}


def load_exports(root):
    data = load_data(root)
    data["notes"] = read_csv(root, "dated_notes.csv",
                             ("date", "week", "source", "scope", "category", "title", "line", "estimated_tokens"),
                             ("line", "estimated_tokens"))
    data["plans"] = read_csv(root, "plan_items.csv",
                             ("source", "scope", "category", "line", "recorded_status", "item", "references"), ("line",))
    return data


def selected_commits(data, scope="combined", include_legacy=False, start=None, end=None):
    if scope != "combined":
        records = data["scoped"][scope]
    elif include_legacy:
        records = data["commits"]
    else:
        legacy = {row["hash"]: row for row in data["scoped"]["legacy_frontend"]}
        other_hashes = {row["hash"] for name, rows in data["scoped"].items()
                        if name != "legacy_frontend" for row in rows}
        records = []
        for original in data["commits"]:
            old = legacy.get(original["hash"])
            # Drop legacy-only commits; preserve cross-scope commits once and
            # subtract only their legacy line metrics, not their entire changes.
            if old is not None and original["hash"] not in other_hashes:
                continue
            row = dict(original)
            if old is not None:
                for metric in METRICS:
                    row[metric] -= old[metric]
            records.append(row)
    return [dict(row) for row in records if (start is None or row["date"] >= str(start))
            and (end is None or row["date"] <= str(end))]


def select_records(records, scope, include_legacy, start=None, end=None):
    return [dict(row) for row in records
            if (row["scope"] == scope if scope != "combined" else include_legacy or row["scope"] != "legacy_frontend")
            and (start is None or row.get("date", str(start)) >= str(start))
            and (end is None or row.get("date", str(end)) <= str(end))]


def weekly_commits(records, start, end):
    counts = defaultdict(lambda: dict(commits=0, ai_commits=0, **dict.fromkeys(METRICS, 0)))
    for row in records:
        target = counts[row["week"]]
        target["commits"] += 1
        target["ai_commits"] += row["ai"]
        for metric in METRICS:
            target[metric] += row[metric]
    first = start - dt.timedelta(days=start.weekday())
    last = end - dt.timedelta(days=end.weekday())
    return [dict(week=first + dt.timedelta(weeks=index),
                 **counts[(first + dt.timedelta(weeks=index)).isoformat()])
            for index in range((last - first).days // 7 + 1)]


def note_activity(notes, start, end):
    counts = Counter((row["week"], row["category"]) for row in notes)
    return [dict(week=row["week"], session_entries=counts[row["week"].isoformat(), "Session log"],
                 ai_entries=counts[row["week"].isoformat(), "AI log"])
            for row in weekly_commits([], start, end)]


def metrics(records):
    return dict(commits=len(records), authors=len({row["author"] for row in records}),
                ai_commits=sum(row["ai"] for row in records),
                **{metric: sum(row[metric] for row in records) for metric in METRICS})


def comparison(data, scope, include_legacy, start, end):
    scopes = (["backend", "next", "shared"] + (["legacy_frontend"] if include_legacy else [])) if scope == "combined" else [scope]
    result = []
    for name in scopes:
        current = metrics(selected_commits(data, name, True, start, end))
        result.append(dict(application=LABELS[name], scope=name, **current))
    return result


def recorded_note_tokens(notes):
    totals = Counter()
    for note in notes:
        totals[note["week"]] += note["estimated_tokens"]
    cumulative, output = 0, []
    if not totals:
        return output
    first = dt.date.fromisoformat(min(totals))
    last = dt.date.fromisoformat(max(totals))
    weeks = [(first + dt.timedelta(weeks=index)).isoformat()
             for index in range((last - first).days // 7 + 1)]
    for week in weeks:
        cumulative += totals[week]
        output.append(dict(week=dt.date.fromisoformat(week), estimated_note_tokens=totals[week],
                           cumulative_recorded_text_tokens=cumulative))
    return output
