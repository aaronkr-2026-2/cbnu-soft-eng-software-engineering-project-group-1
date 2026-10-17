import { useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  InputAdornment,
  Skeleton,
  TextField,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useMembers } from '../../libs/hooks/useMembers';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import { DoctorCard } from './DoctorCard';

export function DoctorsPage() {
  const { members, loading, error, retry } = useMembers(undefined, 'doctors');
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const matching = members.filter((doctor) =>
    [
      doctor.memberFullName,
      doctor.memberNick,
      ...(doctor.doctorSpecializations || []).map((value) =>
        value.replaceAll('_', ' '),
      ),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(term),
  );

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
              Get to know our doctors and find the right specialization for your
              care.
            </p>
          </div>
        </section>
        <section
          className="container doctors-page__directory"
          aria-labelledby="doctor-results-title"
        >
          <h2 id="doctor-results-title">Doctor directory</h2>
          <div className="doctors-page__toolbar">
            <TextField
              label="Search doctors"
              placeholder="Doctor name or specialization"
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
          <p className="doctors-page__count" role="status" aria-live="polite">
            {loading
              ? 'Finding doctors…'
              : error
                ? 'Directory unavailable'
                : `${matching.length} ${matching.length === 1 ? 'doctor' : 'doctors'} found`}
          </p>
          {loading && (
            <div
              className="doctors-page__grid"
              aria-label="Loading doctors"
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
              action={
                <Button color="inherit" onClick={retry}>
                  Try again
                </Button>
              }
            >
              {error}
            </Alert>
          )}
          {!loading && !error && (
            <>
              {matching.length ? (
                <div className="doctors-page__grid">
                  {matching.map((doctor) => (
                    <DoctorCard key={doctor._id} doctor={doctor} />
                  ))}
                </div>
              ) : (
                <div className="doctors-page__empty">
                  <SearchRounded aria-hidden="true" />
                  <h3>
                    {members.length
                      ? 'No matching doctors'
                      : 'No doctors listed yet'}
                  </h3>
                  <p>
                    {members.length
                      ? 'Try another doctor name or specialization.'
                      : 'Please check back soon as doctors join MedConnect.'}
                  </p>
                </div>
              )}
              {members.length >= 100 && (
                <p className="doctors-page__note">
                  Showing up to 100 doctors. More doctors may be available.
                </p>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
