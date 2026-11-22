import { useState } from 'react';
import { useRouter } from 'next/router';
import { Alert, Button } from '@mui/material';
import type { Action, Receipt } from '../../types/booking';
import { CareLayout } from './CareLayout';
import { PatientGate } from './PatientGate';
import { ActionDialog } from './ActionDialog';
import { useBookingSelection } from './useBookingSelection';
import { useBookingSlots } from './useBookingSlots';
import { useReplacementSource } from './useReplacementSource';
import {
  CareTeamSelection,
  AppointmentTimeSelection,
  VisitSummary,
  ReplacementSource,
} from './BookingFormViews';
export function BookPage() {
  return (
    <CareLayout
      title="Find your next visit."
      intro="Choose your care team and a time. Every appointment lasts 30 minutes."
    >
      <PatientGate>
        <BookingForm />
      </PatientGate>
    </CareLayout>
  );
}
function BookingForm() {
  const router = useRouter();
  const selection = useBookingSelection(router);
  useBookingSlots(selection);
  const source = useReplacementSource(router, selection.retry);
  const {
    slot,
    doctorId,
    clinicId,
    specialty,
    clinic,
    linkedTarget,
    linkedChecked,
    error,
    setRetry,
    setDirectoryRetry,
  } = selection;
  const { original, setOriginal, setSourceError, sourceLoading, replacing } =
    source;
  const [action, setAction] = useState<Action>();
  const [open, setOpen] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  function keepOriginal() {
    void router.replace('/book', undefined, { shallow: true });
    setOriginal(undefined);
    setSourceError('');
  }
  function review() {
    if (!slot || uncertain) return;
    setAction({
      operation: original ? 'REPLACE' : 'CREATE',
      kind: slot.state === 'AVAILABLE' ? 'APPOINTMENT' : 'WAITLIST',
      target: { doctorId, clinicId, specialty, startsAt: slot.startsAt },
      original,
    });
    setOpen(true);
  }
  function complete(_receipt: Receipt) {
    setUncertain(false);
    setRetry((value) => value + 1);
    if (replacing) keepOriginal();
  }
  return (
    <>
      {linkedTarget && (
        <Alert severity="info">
          This link refers to one exact doctor, specialty and time.{' '}
          {linkedChecked
            ? 'The time has been checked; only currently eligible options can be selected.'
            : 'Choose the linked care team to check its current time.'}{' '}
          An alert does not reserve a slot.
        </Alert>
      )}
      {replacing && (
        <ReplacementSource
          source={source}
          selection={selection}
          uncertain={uncertain}
          keepOriginal={keepOriginal}
        />
      )}
      {error && (
        <Alert
          severity="warning"
          action={
            <Button
              onClick={() => {
                setDirectoryRetry((value) => value + 1);
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {uncertain && (
        <Alert severity="warning">
          A previous request has an uncertain result. Check it before making
          another request.{' '}
          <Button onClick={() => setOpen(true)}>Check previous request</Button>
        </Alert>
      )}
      <div className="care-book-grid">
        <div>
          <CareTeamSelection selection={selection} uncertain={uncertain} />
          <AppointmentTimeSelection
            selection={selection}
            uncertain={uncertain}
          />
        </div>
        <VisitSummary
          selection={selection}
          uncertain={uncertain}
          sourceLoading={sourceLoading}
          replacing={replacing}
          original={original}
          review={review}
        />
      </div>
      {action && (
        <ActionDialog
          action={action}
          open={open}
          zone={clinic?.clinicTimezone || undefined}
          onUncertain={() => setUncertain(true)}
          onComplete={complete}
          onClose={(pending) => {
            setOpen(false);
            if (!pending) {
              setAction(undefined);
              setRetry((value) => value + 1);
            }
          }}
        />
      )}
    </>
  );
}
