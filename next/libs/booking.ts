import type {
  Action,
  BookingProblem,
  Commitment,
  CommitmentKind,
  RecordItem,
  Target,
} from '../types/booking';
export const idPattern = /^[a-f\d]{24}$/i;
export function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
export function sameTarget(a: Target, b: Target) {
  return (
    a.doctorId.toLowerCase() === b.doctorId.toLowerCase() &&
    a.clinicId.toLowerCase() === b.clinicId.toLowerCase() &&
    a.specialty === b.specialty &&
    +new Date(a.startsAt) === +new Date(b.startsAt)
  );
}
export function commitment(kind: CommitmentKind, row: RecordItem): Commitment {
  return {
    kind,
    id: row._id,
    version: row.version,
    doctorId: row.doctorId,
    clinicId: row.clinicId,
    specialty: row.specialty,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
  };
}
export function replaceable(row: Commitment) {
  return (
    !!row.version &&
    +new Date(row.startsAt) > Date.now() &&
    (row.kind === 'APPOINTMENT'
      ? row.status === 'CONFIRMED'
      : ['ACTIVE', 'NOTIFICATION_ONLY'].includes(row.status))
  );
}
export function needsForfeit(action: Action) {
  return (
    action.operation === 'REPLACE' &&
    action.original?.kind === 'APPOINTMENT' &&
    action.kind === 'WAITLIST'
  );
}
export function dateInZone(date: Date, zone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function timeLabel(startsAt: string, zone = 'UTC', full = true) {
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone: zone,
      ...(full
        ? ({
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            weekday: 'short',
          } as const)
        : {}),
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(startsAt));
  } catch {
    return new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(startsAt));
  }
}
export function parseProblem(value: unknown): BookingProblem | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (
    typeof data.reason !== 'string' ||
    !Array.isArray(data.existingCommitments) ||
    !Array.isArray(data.choices)
  )
    return;
  const entries: Commitment[] = [];
  for (const raw of data.existingCommitments.slice(0, 100)) {
    if (!raw || typeof raw !== 'object') return;
    const row = raw as Record<string, unknown>;
    if (
      !['APPOINTMENT', 'WAITLIST'].includes(String(row.kind)) ||
      !['id', 'doctorId', 'clinicId'].every(
        (key) =>
          typeof row[key] === 'string' && idPattern.test(row[key] as string),
      ) ||
      !['startsAt', 'endsAt'].every(
        (key) =>
          typeof row[key] === 'string' &&
          Number.isFinite(+new Date(row[key] as string)),
      ) ||
      typeof row.status !== 'string' ||
      typeof row.specialty !== 'string'
    )
      return;
    entries.push({
      kind: row.kind as CommitmentKind,
      id: String(row.id),
      doctorId: String(row.doctorId),
      clinicId: String(row.clinicId),
      specialty: row.specialty,
      startsAt: String(row.startsAt),
      endsAt: String(row.endsAt),
      status: row.status,
      version: typeof row.version === 'string' ? row.version : null,
    });
  }
  return {
    reason: data.reason,
    existingCommitments: entries,
    choices: data.choices.filter(
      (choice): choice is string =>
        choice === 'KEEP' ||
        (choice === 'REPLACE' &&
          data.existingCommitments instanceof Array &&
          data.existingCommitments.length === 1 &&
          entries.length === 1 &&
          replaceable(entries[0])),
    ),
  };
}
