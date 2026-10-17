import { useState } from 'react';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Rating,
  Typography,
} from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LocalHospitalOutlined from '@mui/icons-material/LocalHospitalOutlined';
import type { PublicMember } from '../../libs/api/public-members';

interface DoctorCardProps {
  doctor: PublicMember;
  clinicName?: string;
  onViewProfile?: (doctor: PublicMember) => void;
}

const DEFAULT_DOCTOR_IMAGE = '/images/users/defaultUser.svg';

export function DoctorCard({
  doctor,
  clinicName,
  onViewProfile,
}: DoctorCardProps) {
  const name =
    doctor.memberFullName?.trim() || doctor.memberNick.trim() || 'Doctor';
  const image = doctor.memberImage?.trim();
  const [failedImage, setFailedImage] = useState<string>();
  const hasDoctorImage = Boolean(image && image !== failedImage);
  const clinic = clinicName?.trim();
  const description = doctor.memberDesc?.trim();
  const specializations = doctor.doctorSpecializations
    ?.map((value) => value.trim())
    .filter(Boolean)
    .map((value) =>
      value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    )
    .join(' · ');

  return (
    <Card component="article" variant="outlined" className="doctor-summary-card">
      <CardMedia
        component="img"
        className="doctor-summary-card__image"
        image={hasDoctorImage ? image : DEFAULT_DOCTOR_IMAGE}
        alt={hasDoctorImage ? name : 'Default doctor image'}
        loading="lazy"
        onError={hasDoctorImage ? () => setFailedImage(image) : undefined}
      />
      <CardContent className="doctor-summary-card__content">
        <Typography
          component="h3"
          variant="h6"
          className="doctor-summary-card__name"
        >
          {name}
        </Typography>
        <Typography component="p" className="doctor-summary-card__specializations">
          {specializations || 'Specialization not listed'}
        </Typography>
        {clinic && (
          <Typography component="p" className="doctor-summary-card__clinic">
            <LocalHospitalOutlined fontSize="small" aria-hidden="true" />
            <span>{clinic}</span>
          </Typography>
        )}
        {description && (
          <Typography component="p" className="doctor-summary-card__description">
            {description}
          </Typography>
        )}
        <div className="doctor-summary-card__rating">
          {/* Ratings are pending backend support; these are not zero-star scores. */}
          <span aria-hidden="true">
            <Rating value={null} readOnly size="small" />
          </span>
          <Typography component="span" variant="body2">
            Ratings coming soon
          </Typography>
        </div>
      </CardContent>
      {onViewProfile && (
        <CardActions className="doctor-summary-card__actions">
          <Button
            endIcon={<ArrowForwardRounded />}
            onClick={() => onViewProfile(doctor)}
            aria-label={`View profile for ${name}`}
          >
            View profile
          </Button>
        </CardActions>
      )}
    </Card>
  );
}
