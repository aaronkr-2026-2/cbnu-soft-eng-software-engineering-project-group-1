import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, InputAdornment, Skeleton, TextField } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import { useMembers } from '../../libs/hooks/useMembers';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import { ClinicCard } from './ClinicCard';
import { DoctorsDialog } from './DoctorsDialog';

export function ClinicsPage() {
  const { members, loading, error, retry } = useMembers();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PublicMember | null>(null);
  const term = search.trim().toLowerCase();
  const matching = members.filter((clinic) =>
    [memberName(clinic), clinic.memberAddress]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(term),
  );

  return (
    <div className="landing clinics-page site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <section className="clinics-page__intro">
          <div className="container">
            <Button component={Link} href="/" startIcon={<ArrowBackRounded />}>
              Back to home
            </Button>
            <span className="eyebrow">FIND YOUR CARE TEAM</span>
            <h1>Find a clinic.</h1>
            <p>
              Explore clinics, find their locations, and get to know their doctors.
            </p>
          </div>
        </section>
        <section
          className="container clinics-page__directory"
          aria-labelledby="clinic-results-title"
        >
          <h2 id="clinic-results-title">Clinic directory</h2>
          <div className="clinics-page__toolbar">
            <TextField
              label="Search clinics"
              placeholder="Clinic name or address"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded />
                    </InputAdornment>
                  ),
                },
              }}
            />
            {search && (
              <Button onClick={() => setSearch('')}>Clear search</Button>
            )}
          </div>
          <p className="clinics-page__count" role="status" aria-live="polite">
            {loading
              ? 'Finding clinics…'
              : error
                ? 'Directory unavailable'
                : `${matching.length} ${matching.length === 1 ? 'clinic' : 'clinics'} found`}
          </p>
          {loading && (
            <div
              className="clinics-page__grid"
              aria-label="Loading clinics"
              aria-busy="true"
            >
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} variant="rounded" height={360} />
              ))}
            </div>
          )}
          {!loading && error && (
            <Alert
              severity="warning"
              action={<Button color="inherit" onClick={retry}>Try again</Button>}
            >
              {error}
            </Alert>
          )}
          {!loading && !error && (
            <>
              {matching.length ? (
                <div className="clinics-page__grid">
                  {matching.map((clinic) => (
                    <ClinicCard
                      key={clinic._id}
                      clinic={clinic}
                      onViewDoctors={setSelected}
                    />
                  ))}
                </div>
              ) : (
                <div className="clinics-page__empty">
                  <SearchRounded aria-hidden="true" />
                  <h3>
                    {members.length ? 'No matching clinics' : 'No clinics listed yet'}
                  </h3>
                  <p>
                    {members.length
                      ? 'Try another clinic name or address.'
                      : 'Please check back soon as clinics join MedConnect.'}
                  </p>
                </div>
              )}
              {members.length >= 100 && (
                <p className="clinics-page__note">
                  Showing up to 100 clinics. More clinics may be available.
                </p>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
      {selected && (
        <DoctorsDialog
          key={selected._id}
          clinic={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
