import { useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Autocomplete,
  Button,
  MenuItem,
  Pagination,
  Skeleton,
  TextField,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  directoryCities,
  directoryLabel,
  directorySpecialties,
} from '../../libs/directory';
import {
  useDirectoryLocation,
  useDoctorDirectory,
  useDoctorSuggestions,
} from '../../libs/hooks/useDirectory';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import { DoctorCard } from './DoctorCard';

export function DoctorsPage() {
  const {
    filters,
    draft,
    navigating,
    error: navigationError,
    navigation,
  } = useDirectoryLocation();
  const { data, loading, error, retry } = useDoctorDirectory(
    filters,
    navigating,
  );
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const suggestions = useDoctorSuggestions(filters, draft, open && !navigating);
  const disabled = !filters;
  const pages = Math.min(1000, Math.ceil((data?.total || 0) / 12));

  return (
    <div className="landing doctors-page site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <section className="doctors-page__intro">
          <div className="container">
            <Button component={Link} href="/" startIcon={<ArrowBackRounded />}>
              Back to home
            </Button>
            <span className="eyebrow">FIND YOUR CARE TEAM</span>
            <h1>Find a doctor.</h1>
            <p>
              Search by full name, clinic city and specialty to find your care
              team.
            </p>
          </div>
        </section>
        <section
          className="container doctors-page__directory"
          aria-labelledby="doctor-results-title"
        >
          <h2 id="doctor-results-title">Doctor directory</h2>
          <form
            className="doctors-page__toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setOpen(false);
              void navigation.submit();
            }}
          >
            <Autocomplete
              id="doctor-name"
              className="doctors-page__name"
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
                  label="Doctor full name"
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
              label="Clinic city"
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
              label="Specialty"
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
                  {directoryLabel(value)}
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
            <div className="doctors-page__buttons">
              <Button type="submit" variant="contained" disabled={disabled}>
                Search
              </Button>
              <Button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  void navigation.clear();
                }}
              >
                Clear filters
              </Button>
            </div>
          </form>
          {navigationError && (
            <Alert severity="warning">{navigationError}</Alert>
          )}
          <p
            className="doctors-page__count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading
              ? 'Finding doctors…'
              : error
                ? 'Directory unavailable'
                : `${data?.total || 0} ${data?.total === 1 ? 'doctor' : 'doctors'} found${data?.entries.length ? ` · Page ${data.page} of ${pages}` : ''}`}
          </p>
          <div aria-busy={loading}>
            {loading && (
              <div className="doctors-page__grid" aria-label="Loading doctors">
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
                  <div className="doctors-page__grid">
                    {data.entries.map((doctor) => (
                      <DoctorCard key={doctor._id} doctor={doctor} />
                    ))}
                  </div>
                ) : (
                  <div className="doctors-page__empty">
                    <SearchRounded aria-hidden="true" />
                    <h3>No doctors on this page</h3>
                    <p>
                      {data.total
                        ? 'This page is outside the matching results. Choose another page or clear your filters.'
                        : 'Try another name, city or specialty, or clear your filters.'}
                    </p>
                    <Button onClick={() => void navigation.clear()}>
                      Clear filters
                    </Button>
                    {data.total > 0 && (
                      <Button onClick={() => void navigation.page(1)}>
                        Go to first page
                      </Button>
                    )}
                  </div>
                )}
                {pages > 1 && data.page <= pages && (
                  <Pagination
                    className="doctors-page__pagination"
                    count={pages}
                    page={data.page}
                    onChange={(_event, page) => void navigation.page(page)}
                    showFirstButton
                    showLastButton
                    aria-label="Doctor result pages"
                  />
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
