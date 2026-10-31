import type { Commitment, Target } from '../../types/booking';
import type { PublicMember } from '../../libs/api/public-members';
import { memberName } from '../../libs/api/public-members';
import { label, timeLabel } from '../../libs/booking';
export function CommitmentView({
  value,
  profiles,
  zone,
  title,
}: {
  value: Target & Partial<Commitment>;
  profiles: Record<string, PublicMember>;
  zone?: string;
  title?: string;
}) {
  const clinic = profiles[value.clinicId],
    doctor = profiles[value.doctorId];
  const timezone = clinic?.clinicTimezone || zone || 'UTC';
  return (
    <div className="care-commitment">
      {title && <h3>{title}</h3>}
      <strong>
        {doctor ? memberName(doctor) : `Doctor ${value.doctorId.slice(-6)}`}
      </strong>
      <p>
        {clinic ? memberName(clinic) : `Clinic ${value.clinicId.slice(-6)}`}
      </p>
      <p>{label(value.specialty || 'Specialty not recorded')}</p>
      <p>
        <time dateTime={value.startsAt}>
          {timeLabel(value.startsAt, timezone)}
        </time>
      </p>
      <p className="care-meta">30-minute visit · {timezone}</p>
      {value.status && (
        <span
          className={`care-status care-status--${value.status.toLowerCase()}`}
        >
          {label(value.status)}
        </span>
      )}
    </div>
  );
}
