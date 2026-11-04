export const directoryCities = [
  'SEOUL',
  'INCHEON',
  'BUSAN',
  'JEJU',
  'DAEGU',
  'DAEJEON',
  'GWANGJU',
  'ULSAN',
  'SUWON',
  'SEJONG',
] as const;
export const directorySpecialties = [
  'CARDIOLOGIST',
  'DENTIST',
  'PEDIATRICIAN',
  'DERMATOLOGIST',
  'PSYCHIATRIST',
  'NEUROLOGIST',
  'OPHTHALMOLOGIST',
  'ORTHOPEDIC',
  'ONCOLOGIST',
  'GYNAECOLOGIST',
  'GASTROENTEROLOGIST',
  'OTOLARYNGOLOGIST',
  'SURGEON',
] as const;
export type DirectoryFilters = {
  name: string;
  city: string;
  specialty: string;
  sort: 'NAME_ASC' | 'NAME_DESC';
  page: number;
};
export const defaultDirectory: DirectoryFilters = {
  name: '',
  city: '',
  specialty: '',
  sort: 'NAME_ASC',
  page: 1,
};

// Some transports can finish after aborting. Both result and suggestion readers
// must ignore late successes as well as late failures after their effect ends.
export async function directoryRead<T>(
  signal: AbortSignal,
  load: () => Promise<T>,
  receive: (data: T) => void,
  failed: (error: Error) => void,
) {
  try {
    const data = await load();
    if (!signal.aborted) receive(data);
  } catch (error) {
    if (!signal.aborted)
      failed(
        error instanceof Error
          ? error
          : new Error('Directory unavailable. Please try again.'),
      );
  }
}
export function directoryLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function parseDirectoryUrl(url: string): DirectoryFilters {
  const params = new URL(url, 'http://directory.local').searchParams;
  const one = (key: string) =>
    params.getAll(key).length === 1 ? params.get(key)! : '';
  const page = one('page');
  return {
    name: Array.from(one('name').trim()).slice(0, 100).join(''),
    city: directoryCities.includes(
      one('city') as (typeof directoryCities)[number],
    )
      ? one('city')
      : '',
    specialty: directorySpecialties.includes(
      one('specialty') as (typeof directorySpecialties)[number],
    )
      ? one('specialty')
      : '',
    sort: one('sort') === 'NAME_DESC' ? 'NAME_DESC' : 'NAME_ASC',
    page:
      /^[1-9]\d{0,3}$/.test(page) && Number(page) <= 1000 ? Number(page) : 1,
  };
}
export function directoryUrl(path: string, filters: DirectoryFilters) {
  const params = new URLSearchParams();
  if (filters.name) params.set('name', filters.name);
  if (filters.city) params.set('city', filters.city);
  if (filters.specialty) params.set('specialty', filters.specialty);
  if (filters.sort !== 'NAME_ASC') params.set('sort', filters.sort);
  if (filters.page !== 1) params.set('page', String(filters.page));
  return path + (params.size ? '?' + params : '');
}

type LocationState = {
  filters: DirectoryFilters | null;
  draft: string;
  navigating: boolean;
  error: string;
};
// One instance per directory. Router events restore committed URL state; typing is
// only a draft. Cancel the timer synchronously before any deliberate navigation.
export class DirectoryNavigation {
  private state: LocationState = {
    filters: null,
    draft: '',
    navigating: false,
    error: '',
  };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private pending?: DirectoryFilters;
  constructor(
    private readonly navigate: (
      filters: DirectoryFilters,
      replace: boolean,
    ) => Promise<boolean>,
    private readonly delay = 300,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: LocationState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  cancel = () => {
    clearTimeout(this.timer);
    this.revision++;
  };
  restore = (url: string) => {
    const filters = parseDirectoryUrl(url);
    const keepDraft =
      this.pending &&
      JSON.stringify(this.pending) === JSON.stringify(filters) &&
      this.state.draft !== this.pending.name;
    if (!keepDraft) this.cancel();
    this.pending = undefined;
    this.publish({
      filters,
      draft: keepDraft ? this.state.draft : filters.name,
      navigating: false,
      error: '',
    });
  };
  leaving = (url?: string) => {
    this.cancel();
    if (
      !url ||
      JSON.stringify(parseDirectoryUrl(url)) !== JSON.stringify(this.pending)
    )
      this.pending = undefined;
    this.publish({ ...this.state, navigating: true });
  };
  edit = (draft: string) => {
    this.cancel();
    this.publish({ ...this.state, draft });
    this.timer = setTimeout(() => {
      void this.go({ name: draft.trim(), page: 1 }, true);
    }, this.delay);
  };
  submit = (name = this.state.draft) => this.go({ name: name.trim(), page: 1 });
  filter = (patch: Partial<DirectoryFilters>) =>
    this.go({ ...patch, name: this.state.draft.trim(), page: 1 });
  page = (page: number) => this.go({ page });
  clear = () => this.go(defaultDirectory);
  private async go(patch: Partial<DirectoryFilters>, replace = false) {
    this.cancel();
    if (!this.state.filters) return;
    const current = this.pending || this.state.filters;
    const filters = { ...current, ...patch };
    if (JSON.stringify(filters) === JSON.stringify(current)) {
      this.publish({ ...this.state, draft: filters.name });
      return;
    }
    this.publish({
      ...this.state,
      draft: filters.name,
      navigating: true,
      error: '',
    });
    this.pending = filters;
    // routeChangeStart may increment revision inside navigate().
    const promise = this.navigate(filters, replace);
    const revision = this.revision;
    try {
      if (!(await promise)) throw new Error('Navigation canceled');
    } catch {
      if (revision === this.revision) {
        this.pending = undefined;
        this.publish({
          ...this.state,
          navigating: false,
          error: 'Could not update the search. Please try again.',
        });
      }
    }
  }
}
