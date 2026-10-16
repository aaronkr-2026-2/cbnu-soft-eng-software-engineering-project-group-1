import { useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Skeleton,
  TextField,
} from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LocalHospitalOutlined from '@mui/icons-material/LocalHospitalOutlined';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import { useMembers } from '../../libs/hooks/useMembers';

function DoctorsDialog({
  clinic,
  onClose,
}: {
  clinic: PublicMember;
  onClose: () => void;
}) {
  const { members, loading, error, retry } = useMembers(clinic._id);
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="doctors-title"
    >
      <DialogTitle id="doctors-title">
        Doctors at {memberName(clinic)}
      </DialogTitle>
      <DialogContent>
        <p className="doctor-intro">
          Get to know the care team before planning your visit.
        </p>
        {loading && (
          <div role="status" aria-label="Loading doctors">
            <Skeleton height={80} />
            <Skeleton height={80} />
          </div>
        )}
        {error && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={retry}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {!loading && !error && members.length === 0 && (
          <p>
            No doctors are listed for this clinic yet. Please check back later.
          </p>
        )}
        <ul className="doctor-list">
          {members.map((doctor) => (
            <li key={doctor._id}>
              <Avatar aria-hidden="true">
                {memberName(doctor).slice(0, 1).toUpperCase()}
              </Avatar>
              <div>
                <h3>{memberName(doctor)}</h3>
                <p>
                  {doctor.doctorSpecializations?.length
                    ? doctor.doctorSpecializations
                        .map((value) =>
                          value.toLowerCase().replaceAll('_', ' '),
                        )
                        .join(' · ')
                    : 'Specialization not listed'}
                </p>
                {doctor.memberDesc && <p>{doctor.memberDesc}</p>}
              </div>
            </li>
          ))}
        </ul>
        <p className="availability-note">
          Online booking is coming soon. Appointment times are not
          available on this page.
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function ClinicDirectory() {
  const { members, loading, error, retry } = useMembers();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PublicMember | null>(null);
  const matching = members.filter((member) =>
    [memberName(member), member.memberAddress, member.memberDesc]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <section
      className="landing-directory section"
      id="clinics"
      aria-labelledby="clinics-title"
    >
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FIND YOUR CARE TEAM</span>
            <h2 id="clinics-title">
              Good care starts
              <br />
              with the right connection.
            </h2>
          </div>
          <p>
            Explore clinics and their doctors.
            <br />
            Take your next step with a little more clarity.
          </p>
        </div>
        <div className="directory-toolbar">
          <TextField
            label="Search clinics"
            placeholder="Clinic name or location"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size="small"
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
          <span role="status" aria-live="polite">
            {loading
              ? 'Finding clinics…'
              : error
                ? 'Directory unavailable'
                : `${matching.length} ${matching.length === 1 ? 'clinic' : 'clinics'}`}
          </span>
        </div>
        {loading && (
          <div
            className="clinic-grid"
            role="status"
            aria-label="Loading clinics"
          >
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} variant="rounded" height={270} />
            ))}
          </div>
        )}
        {!loading && error && (
          <div className="directory-state">
            <LocalHospitalOutlined />
            <h3>A connection worth waiting for.</h3>
            <p>{error}</p>
            <Button variant="outlined" onClick={retry}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && matching.length === 0 && (
          <div className="directory-state">
            <SearchRounded />
            <h3>
              {members.length
                ? 'No matching clinics'
                : 'Our clinic directory is getting started.'}
            </h3>
            <p>
              {members.length
                ? 'Try a different clinic name or location.'
                : 'There are no clinics listed yet. Please check back soon.'}
            </p>
            {search && (
              <Button onClick={() => setSearch('')}>Clear search</Button>
            )}
          </div>
        )}
        {!loading && !error && (
          <div className="clinic-grid">
            {matching.map((clinic, index) => (
              <article className="clinic-card" key={clinic._id}>
                <div className={`clinic-mark clinic-mark-${index % 3}`}>
                  <LocalHospitalOutlined />
                </div>
                <span className="clinic-category">CLINIC</span>
                <h3>{memberName(clinic)}</h3>
                {clinic.memberAddress && (
                  <p className="clinic-location">
                    <LocationOnOutlined />
                    {clinic.memberAddress}
                  </p>
                )}
                <p className="clinic-description">
                  {clinic.memberDesc ||
                    'Discover this clinic and meet its doctors.'}
                </p>
                {clinic.clinicTimezone && (
                  <p className="clinic-timezone">
                    Clinic timezone: {clinic.clinicTimezone}
                  </p>
                )}
                <Button
                  endIcon={<ArrowForwardRounded />}
                  onClick={() => setSelected(clinic)}
                  aria-label={`View doctors at ${memberName(clinic)}`}
                >
                  View doctors
                </Button>
              </article>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <DoctorsDialog
          key={selected._id}
          clinic={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
