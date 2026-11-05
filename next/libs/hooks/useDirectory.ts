import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/router';
import {
  DirectoryNavigation,
  directoryRead,
  directoryUrl,
  type DirectoryFilters,
  type DirectoryKind,
} from '../directory';
import {
  searchDoctors,
  searchClinics,
  suggestDoctorNames,
  suggestClinicNames,
  type DirectoryPage,
} from '../api/directory';

export function useDirectoryLocation() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [navigation] = useState(
    () =>
      new DirectoryNavigation((filters, replace) => {
        const current = routerRef.current;
        return current[replace ? 'replace' : 'push'](
          directoryUrl(current.pathname, filters),
          undefined,
          { shallow: true, scroll: false },
        );
      }),
  );
  const state = useSyncExternalStore(
    navigation.subscribe,
    navigation.snapshot,
    navigation.snapshot,
  );
  useEffect(() => {
    if (!router.isReady) return;
    navigation.restore(router.asPath);
  }, [router.isReady, router.asPath, navigation]);
  useEffect(() => {
    const start = (url: string) => navigation.leaving(url);
    const failed = (error: { cancelled?: boolean }) => {
      if (!error.cancelled) navigation.restore(routerRef.current.asPath);
    };
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeError', failed);
    return () => {
      navigation.cancel();
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeError', failed);
    };
  }, [router.events, navigation]);
  return { ...state, navigation };
}

// Key each response to its request. Even the render before an effect cleans up
// cannot display a previous page as if it matched the new URL or new draft.
export function useDirectoryResults(
  kind: DirectoryKind,
  filters: DirectoryFilters | null,
  navigating: boolean,
) {
  const [attempt, setAttempt] = useState(0);
  const key =
    filters && !navigating
      ? kind + ':' + JSON.stringify(filters) + ':' + attempt
      : '';
  const [result, setResult] = useState<{
    key: string;
    data?: DirectoryPage;
    error?: string;
  }>({ key: '' });
  useEffect(() => {
    if (!key || !filters) return;
    const controller = new AbortController();
    void directoryRead(
      controller.signal,
      () =>
        (kind === 'doctors' ? searchDoctors : searchClinics)(
          filters,
          controller.signal,
        ),
      (data) => setResult({ key, data }),
      (reason) => setResult({ key, error: reason.message }),
    );
    return () => controller.abort();
    // filters are fully represented by key.
  }, [key]);
  const current = key && result.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
  };
}

export function useDirectorySuggestions(
  kind: DirectoryKind,
  filters: DirectoryFilters | null,
  draft: string,
  enabled: boolean,
) {
  const input = {
    name: draft.trim(),
    city: filters?.city || '',
    specialty: filters?.specialty || '',
  };
  const key =
    enabled && filters && Array.from(input.name).length >= 2
      ? JSON.stringify({ kind, input })
      : '';
  const [result, setResult] = useState<{
    key: string;
    names?: string[];
    failed?: boolean;
  }>({ key: '' });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void directoryRead(
        controller.signal,
        () =>
          (kind === 'doctors' ? suggestDoctorNames : suggestClinicNames)(
            JSON.parse(key).input,
            controller.signal,
          ),
        (names) => setResult({ key, names }),
        () => setResult({ key, failed: true }),
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  const current = key && result.key === key ? result : undefined;
  return {
    names: current?.names || [],
    failed: !!current?.failed,
    loading: !!key && !current,
  };
}
