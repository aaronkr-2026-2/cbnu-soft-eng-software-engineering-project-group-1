import {
  cancelDeletionBlocker,
  deletionReadiness,
} from './api/account-deletion';
import { BookingError } from './api/booking';
import type {
  DeletionBlocker,
  DeletionList,
  DeletionReadiness,
} from '../types/account-deletion';

export type DeletionDialogState = {
  status: 'loading' | 'ready' | 'error';
  data: DeletionReadiness | null;
  pending: string | null;
  loadingMore: DeletionList | null;
  message: string;
  error: string;
};
const initial: DeletionDialogState = {
  status: 'loading',
  data: null,
  pending: null,
  loadingMore: null,
  message: '',
  error: '',
};
export const blockerKey = (row: DeletionBlocker) => `${row.kind}:${row.id}`;
export function resolutionMessage(reason: string | null) {
  return (
    {
      CONTACT_PATIENT_OR_CLINIC:
        'Ask the patient or the clinic to cancel this booking.',
      CONTACT_PATIENT: 'Ask the patient to cancel this waitlist entry.',
      VISIT_IN_PROGRESS:
        'This visit is in progress. It must end before account deletion.',
      LEGACY_RESOLUTION_REQUIRED:
        'Ask the clinic to resolve this record before account deletion.',
    }[reason || ''] || 'Contact the clinic to resolve this commitment.'
  );
}

// One instance per open dialog. Revisions discard late reads after close or refresh.
export class AccountDeletionReview {
  private state = initial;
  private revision = 0;
  private request?: AbortController;
  private listeners = new Set<() => void>();
  constructor(
    private readonly load = deletionReadiness,
    private readonly cancel = cancelDeletionBlocker,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<DeletionDialogState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  dispose = () => {
    this.revision++;
    this.request?.abort();
    this.request = undefined;
  };
  async refresh(message = '') {
    if (this.state.pending) return;
    this.dispose();
    const revision = this.revision;
    const controller = new AbortController();
    this.request = controller;
    this.publish({ status: 'loading', loadingMore: null, message, error: '' });
    try {
      const data = await this.load({}, controller.signal);
      if (revision === this.revision) this.publish({ status: 'ready', data });
    } catch (error) {
      if (revision === this.revision)
        this.publish({ status: 'error', error: this.errorMessage(error) });
    } finally {
      if (revision === this.revision) this.request = undefined;
    }
  }
  async more(list: DeletionList) {
    const data = this.state.data;
    if (
      this.request ||
      this.state.status !== 'ready' ||
      !data?.[list].nextCursor
    )
      return;
    const revision = this.revision;
    const controller = new AbortController();
    this.request = controller;
    this.publish({ loadingMore: list, error: '' });
    try {
      const page = await this.load(
        list === 'appointments'
          ? { appointmentAfter: data.appointments.nextCursor! }
          : { waitlistAfter: data.waitlists.nextCursor! },
        controller.signal,
      );
      if (revision !== this.revision) return;
      if (
        page.appointmentCount !== data.appointmentCount ||
        page.waitlistCount !== data.waitlistCount ||
        page.affiliationImpactCount !== data.affiliationImpactCount
      ) {
        await this.refresh(
          'Your commitments changed. The lists have been refreshed.',
        );
        return;
      }
      const ids = new Set(data[list].entries.map((row) => row.id));
      const loaded = data[list].entries.length + page[list].entries.length;
      const count =
        list === 'appointments' ? page.appointmentCount : page.waitlistCount;
      if (
        page[list].nextCursor === data[list].nextCursor ||
        page[list].entries.some((row) => ids.has(row.id)) ||
        loaded > count ||
        (!page[list].nextCursor && loaded !== count)
      )
        throw new BookingError(
          'The list changed during loading. Refresh current commitments.',
        );
      this.publish({
        data: {
          ...data,
          asOf: page.asOf,
          [list]: {
            entries: [...data[list].entries, ...page[list].entries],
            nextCursor: page[list].nextCursor,
          },
        },
      });
    } catch (error) {
      if (revision === this.revision)
        this.publish({ status: 'error', error: this.errorMessage(error) });
    } finally {
      if (revision === this.revision) {
        this.request = undefined;
        this.publish({ loadingMore: null });
      }
    }
  }
  async act(row: DeletionBlocker) {
    if (
      this.request ||
      this.state.status !== 'ready' ||
      row.permittedAction === 'NONE'
    )
      return;
    const list = row.kind === 'APPOINTMENT' ? 'appointments' : 'waitlists';
    const current = this.state.data?.[list].entries.find(
      (item) => item.id === row.id,
    );
    if (!current || current.permittedAction !== row.permittedAction) return;
    const revision = this.revision;
    const controller = new AbortController();
    this.request = controller;
    this.publish({ pending: blockerKey(row), message: '', error: '' });
    let message =
      row.kind === 'APPOINTMENT'
        ? 'Booking canceled.'
        : 'Waitlist entry canceled.';
    let errorMessage = '';
    try {
      await this.cancel(current, controller.signal);
    } catch (error) {
      errorMessage = this.errorMessage(error);
      message =
        error instanceof BookingError && error.uncertain
          ? 'The cancellation response could not be confirmed. Review current commitments before trying again.'
          : '';
    }
    if (revision !== this.revision) return;
    // Always refresh both lists, since a cancellation can trigger allocation.
    this.request = undefined;
    this.publish({ pending: null });
    await this.refresh(message);
    if (revision + 1 === this.revision && errorMessage)
      this.publish({
        error: [errorMessage, this.state.error].filter(Boolean).join(' '),
      });
  }
  private errorMessage(error: unknown) {
    if (error instanceof BookingError && error.code === 'CONFLICT')
      return 'Some account records need attention. Refresh or ask the clinic for help.';
    return error instanceof BookingError
      ? error.message
      : 'Commitments could not be loaded. Check your connection and refresh.';
  }
}
