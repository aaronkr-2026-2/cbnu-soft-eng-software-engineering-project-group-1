import {
  Alert,
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
} from '@mui/material';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import { useMembers } from '../../libs/hooks/useMembers';

export function DoctorsDialog({
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

