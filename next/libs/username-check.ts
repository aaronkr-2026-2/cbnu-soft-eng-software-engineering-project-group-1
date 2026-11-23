import { checkUsername, UsernameCheckError } from './api/username';
import { usernameError } from './username';

export type UsernameCheckState = {
  value: string;
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';
  message: string;
};
const idle: UsernameCheckState = { value: '', status: 'idle', message: '' };
// One instance per form. A revision prevents late reads from surviving an edit,
// including editing away from a name and then returning to the same spelling.
export class UsernameCheck {
  private state = idle;
  private revision = 0;
  private request?: AbortController;
  private listeners = new Set<() => void>();
  constructor(private readonly load = checkUsername) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: UsernameCheckState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  cancel = () => {
    this.revision++;
    this.request?.abort();
    this.request = undefined;
  };
  reset = () => {
    this.cancel();
    this.publish(idle);
  };
  available(value: string) {
    return (
      this.state.status === 'available' && this.state.value === value.trim()
    );
  }
  taken(value: string) {
    this.cancel();
    this.publish({
      value: value.trim(),
      status: 'taken',
      message: 'Username already taken.',
    });
  }
  async check(value: string, token?: string) {
    this.cancel();
    const invalid = usernameError(value);
    if (invalid) {
      this.publish({
        value: value.trim(),
        status: 'invalid',
        message: invalid,
      });
      return;
    }
    const revision = this.revision;
    const controller = new AbortController();
    this.request = controller;
    this.publish({
      value: value.trim(),
      status: 'checking',
      message: 'Checking…',
    });
    try {
      const result = await this.load(value, controller.signal, token);
      if (revision !== this.revision || controller.signal.aborted) return;
      const status =
        result === 'AVAILABLE'
          ? 'available'
          : result === 'TAKEN'
            ? 'taken'
            : 'invalid';
      this.publish({
        value: value.trim(),
        status,
        message:
          status === 'available'
            ? 'Available'
            : status === 'taken'
              ? 'Username already taken.'
              : 'Enter a valid username.',
      });
    } catch (error) {
      if (revision !== this.revision || controller.signal.aborted) return;
      this.publish({
        value: value.trim(),
        status: 'error',
        message:
          error instanceof UsernameCheckError
            ? error.message
            : 'Could not check availability. Please try again.',
      });
    } finally {
      if (revision === this.revision) this.request = undefined;
    }
  }
}
