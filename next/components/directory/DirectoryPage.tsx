import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  MenuItem,
  Pagination,
  Skeleton,
  TextField,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  directoryCities,
  directoryChips,
  directoryLabel,
  directorySpecialtyLabel,
  directorySpecialties,
  type DirectoryKind,
} from '../../libs/directory';
import {
  useDirectoryLocation,
  useDirectoryResults,
  useDirectorySuggestions,
} from '../../libs/hooks/useDirectory';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import type { PublicMember } from '../../libs/api/public-members';

export function DirectoryPage({
  kind,
  renderEntry,
  children,
}: {
  kind: DirectoryKind;
  renderEntry: (member: PublicMember) => ReactNode;
  children?: ReactNode;
}) {
  const singular = kind === 'doctors' ? 'doctor' : 'clinic';
  const title = kind === 'doctors' ? 'Doctor' : 'Clinic';
  const {
    filters,
    draft,
    navigating,
    error: navigationError,
    navigation,
  } = useDirectoryLocation();
  const { data, loading, error, retry } = useDirectoryResults(
    kind,
    filters,
    navigating,
  );
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const resultSummary = useRef<HTMLParagraphElement>(null);
  const focusResults = useRef(false);
  useEffect(() => {
    if (!loading && focusResults.current) {
      focusResults.current = false;
      resultSummary.current?.focus({ preventScroll: true });
      resultSummary.current?.scrollIntoView({ block: 'start' });
    }
  }, [loading, data, error]);
  const clearFilters = () => {
    setOpen(false);
    setHighlighted(null);
    void navigation.clear();
    nameInput.current?.focus();
  };
  const suggestions = useDirectorySuggestions(
    kind,
    filters,
    draft,
    open && !navigating,
  );
  const disabled = !filters;
  const pages = Math.min(1000, Math.ceil((data?.total || 0) / 12));

  return (
    <div className={`landing directory-page ${kind}-page site-shell`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <section className="directory-page__intro">
          <div className="container">
            <Button component={Link} href="/" startIcon={<ArrowBackRounded />}>
              Back to home
            </Button>
            <span className="eyebrow">FIND YOUR CARE TEAM</span>
            <h1>Find a {singular}.</h1>
            <p>
              {kind === 'doctors'
                ? 'Search by full name, clinic city and specialty to find your care team.'
                : 'Search by clinic name, city and specialty to find your care team.'}
            </p>
          </div>
        </section>
        <section
          className="container directory-page__directory"
          aria-labelledby="directory-results-title"
        >
          <h2 id="directory-results-title">{title} directory</h2>
          <form
            className="directory-page__toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setOpen(false);
              void navigation.submit();
            }}
          >
            <Autocomplete
              id="directory-name"
              className="directory-page__name"
              freeSolo
              disabled={disabled}
              open={open && !disabled && Array.from(draft.trim()).length >= 2}
              onOpen={() => setOpen(true)}
              onClose={() => {
                setOpen(false);
                setHighlighted(null);
              }}
              options={suggestions.names}
              filterOptions={(options) => options}
              inputValue={draft}
              value={null}
              clearOnBlur={false}
              loading={suggestions.loading}
              loadingText="Finding names…"
              onHighlightChange={(_event, value) => setHighlighted(value)}
              onInputChange={(_event, value, reason) => {
                if (reason === 'input' || reason === 'clear') {
                  navigation.edit(value);
                  setHighlighted(null);
                  setOpen(reason === 'input');
                }
              }}
              onChange={(_event, value) => {
                if (typeof value === 'string') {
                  setOpen(false);
                  void navigation.submit(value);
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  !(open && highlighted)
                ) {
                  event.preventDefault();
                  event.defaultMuiPrevented = true;
                  setOpen(false);
                  void navigation.submit();
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={nameInput}
                  label={
                    kind === 'doctors' ? 'Doctor full name' : 'Clinic name'
                  }
                  placeholder="Search by name"
                  helperText={
                    suggestions.failed
                      ? 'Name suggestions unavailable. You can still search.'
                      : 'Type a name or choose a suggestion.'
                  }
                  slotProps={{
                    ...params.slotProps,
                    htmlInput: {
                      ...params.slotProps.htmlInput,
                      maxLength: 100,
                    },
                  }}
                />
              )}
            />
            <TextField
              select
              label={kind === 'doctors' ? 'Clinic city' : 'City'}
              helperText={
                kind === 'doctors'
                  ? 'City of the doctor’s clinic.'
                  : 'City where the clinic is located.'
              }
              slotProps={{
                inputLabel: { shrink: true },
                select: {
                  displayEmpty: true,
                  renderValue: (value) =>
                    value ? directoryLabel(String(value)) : 'All cities',
                },
              }}
              value={filters?.city || ''}
              disabled={disabled}
              onChange={(event) => {
                setOpen(false);
                void navigation.filter({ city: event.target.value });
              }}
            >
              <MenuItem value="">All cities</MenuItem>
              {directoryCities.map((value) => (
                <MenuItem key={value} value={value}>
                  {directoryLabel(value)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={
                kind === 'doctors' ? 'Doctor specialty' : 'Specialty offered'
              }
              helperText={
                kind === 'doctors'
                  ? 'Care provided by the doctor.'
                  : 'Care available at the clinic.'
              }
              slotProps={{
                inputLabel: { shrink: true },
                select: {
                  displayEmpty: true,
                  renderValue: (value) =>
                    value
                      ? directorySpecialtyLabel(String(value))
                      : 'All specialties',
                },
              }}
              value={filters?.specialty || ''}
              disabled={disabled}
              onChange={(event) => {
                setOpen(false);
                void navigation.filter({ specialty: event.target.value });
              }}
            >
              <MenuItem value="">All specialties</MenuItem>
              {directorySpecialties.map((value) => (
                <MenuItem key={value} value={value}>
                  {directorySpecialtyLabel(value)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sort by name"
              value={filters?.sort || 'NAME_ASC'}
              disabled={disabled}
              onChange={(event) => {
                setOpen(false);
                void navigation.filter({
                  sort: event.target.value as 'NAME_ASC' | 'NAME_DESC',
                });
              }}
            >
              <MenuItem value="NAME_ASC">Name A–Z</MenuItem>
              <MenuItem value="NAME_DESC">Name Z–A</MenuItem>
            </TextField>
            <div className="directory-page__buttons">
              <Button type="submit" variant="contained" disabled={disabled}>
                Search
              </Button>
              <Button
                type="button"
                aria-label="Clear all filters"
                disabled={disabled}
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            </div>
          </form>
          {filters && directoryChips(filters).length > 0 && (
            <div
              className="directory-page__chips"
              role="group"
              aria-label="Active search filters"
            >
              {directoryChips(filters).map((chip) => (
                <Chip
                  key={chip.key}
                  label={chip.label}
                  aria-label={`Remove ${chip.label}`}
                  onDelete={() => {
                    setOpen(false);
                    setHighlighted(null);
                    void navigation.filter(chip.remove);
                    nameInput.current?.focus();
                  }}
                />
              ))}
            </div>
          )}
          {navigationError && (
            <Alert severity="warning">{navigationError}</Alert>
          )}
          <p
            className="directory-page__count"
            ref={resultSummary}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading
              ? `Finding ${kind}…`
              : error
                ? 'Directory unavailable'
                : `${data?.total || 0} ${data?.total === 1 ? singular : kind} found${data?.entries.length ? ` · Page ${data.page} of ${pages}` : ''}`}
          </p>
          <div className="directory-page__results" aria-busy={loading}>
            {loading && (
              <div
                className="directory-page__grid"
                aria-label={`Loading ${kind}`}
              >
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <Skeleton key={key} variant="rounded" height={360} />
                ))}
              </div>
            )}
            {!loading && error && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" onClick={retry}>
                    Try again
                  </Button>
                }
              >
                {error}
              </Alert>
            )}
            {!loading && !error && data && (
              <>
                {data.entries.length ? (
                  <div className="directory-page__grid">
                    {data.entries.map(renderEntry)}
                  </div>
                ) : (
                  <div className="directory-page__empty">
                    <SearchRounded aria-hidden="true" />
                    <h3>No {kind} on this page</h3>
                    <p>
                      {data.total
                        ? 'This page is outside the matching results. Choose another page or clear your filters.'
                        : 'Try another name, city or specialty, or clear your filters.'}
                    </p>
                    <Button onClick={clearFilters}>Clear filters</Button>
                    {data.total > 0 && (
                      <Button
                        onClick={() => {
                          focusResults.current = true;
                          void navigation.page(1);
                        }}
                      >
                        Go to first page
                      </Button>
                    )}
                  </div>
                )}
                {pages > 1 && data.page <= pages && (
                  <Pagination
                    className="directory-page__pagination"
                    count={pages}
                    page={data.page}
                    onChange={(_event, page) => {
                      focusResults.current = true;
                      void navigation.page(page);
                    }}
                    showFirstButton
                    showLastButton
                    aria-label={`${title} result pages`}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
      {children}
    </div>
  );
}
