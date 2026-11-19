import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { BookingError } from '../../libs/api/booking';
export interface WorkspaceTask {
  title: string;
  summary: ReactNode;
  run: (signal: AbortSignal) => Promise<string>;
  check?: (signal: AbortSignal) => Promise<string | undefined>;
}
export function WorkspaceReview({
  task,
  open,
  onClose,
  onUncertain,
  onComplete,
}: {
  task: WorkspaceTask;
  open: boolean;
  onClose: (uncertain: boolean) => void;
  onUncertain: () => void;
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const message = uncertain
        ? await task.check?.(controller.signal)
        : await task.run(controller.signal);
      if (controller.signal.aborted) return;
      if (message) {
        setResult(message);
        setUncertain(false);
        onComplete();
      } else
        setError(
          'The requested result is not visible yet. Keep checking current state; do not submit this change again.',
        );
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof BookingError && reason.uncertain) {
        setUncertain(true);
        onUncertain();
        setError(
          'The response was lost. This change may have been saved. Check current state before making another change.',
        );
      } else
        setError(
          reason instanceof BookingError
            ? reason.code === 'CONFLICT'
              ? 'The record changed, or this change conflicts with existing commitments. Refresh and review again.'
              : reason.problem?.reason === 'COMMITMENT_CONFLICT'
                ? 'This patient already has a conflicting commitment. Keep it and resolve the conflict before booking.'
                : reason.message
            : 'This change could not be verified. Refresh and review current state.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose(uncertain);
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="workspace-review-title"
    >
      <DialogTitle id="workspace-review-title">
        {result ? 'Change verified' : task.title}
      </DialogTitle>
      <DialogContent>
        {result ? (
          <Alert severity="success">{result}</Alert>
        ) : (
          <>
            {task.summary}
            {error && (
              <Alert severity={uncertain ? 'warning' : 'error'}>{error}</Alert>
            )}
            {uncertain && !task.check && (
              <p>
                There is no saved-schedule read endpoint to verify this
                response. Inspect the doctor's available times before leaving
                this review. This screen will not repeat the write.
              </p>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => onClose(uncertain)}>
          Close
        </Button>
        {!result && (!uncertain || task.check) && (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy
              ? 'Checking…'
              : uncertain
                ? 'Check current state'
                : 'Confirm change'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
