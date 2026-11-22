import { Alert, Button } from '@mui/material';
import { label, timeLabel } from '../../libs/booking';
import type { PublicMember } from '../../libs/api/public-members';
import type { SchedulePreviewState } from './useSchedulePreview';

export function SchedulePreview({
  state,
  date,
  zone,
  doctor,
}: {
  state: SchedulePreviewState;
  date: string;
  zone: string;
  doctor: PublicMember | undefined;
}) {
  const { preview, previewBusy, previewError, setPreviewRefresh } = state;
  return (
    <section className="care-card">
      <h3>Available times preview</h3>
      <p>
        Preview for {date} · {zone}. This shows effective slots, not the saved
        configuration. Occupancy may change.
      </p>
      <Button
        disabled={!doctor || previewBusy}
        onClick={() => setPreviewRefresh((value) => value + 1)}
      >
        Refresh available times
      </Button>
      {previewBusy ? (
        <p role="status">Loading available times…</p>
      ) : previewError ? (
        <Alert severity="warning">{previewError}</Alert>
      ) : !preview.length ? (
        <p>No times returned for this date.</p>
      ) : (
        <ul className="workspace-times">
          {preview.map((row) => (
            <li key={row.startsAt}>
              {timeLabel(row.startsAt, row.clinicTimezone, false)} ·{' '}
              {label(row.state)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
