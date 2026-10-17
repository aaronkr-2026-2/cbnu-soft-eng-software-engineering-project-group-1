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
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import { memberName, type PublicMember } from '../../libs/api/public-members';

interface ClinicCardProps {
  clinic: PublicMember;
  onViewDoctors?: (clinic: PublicMember) => void;
}

const DEFAULT_CLINIC_IMAGE = '/images/clinics/defaultClinic.png';

export function ClinicCard({ clinic, onViewDoctors }: ClinicCardProps) {
  const name = memberName(clinic);
  const image = clinic.memberImage?.trim();
  const [failedImage, setFailedImage] = useState<string>();
  const hasClinicImage = Boolean(image && image !== failedImage);

  return (
    <Card component="article" variant="outlined" className="clinic-summary-card">
      <CardMedia
        component="img"
        className="clinic-summary-card__image"
        image={hasClinicImage ? image : DEFAULT_CLINIC_IMAGE}
        alt={hasClinicImage ? `${name} clinic` : 'Default clinic image'}
        loading="lazy"
        onError={hasClinicImage ? () => setFailedImage(image) : undefined}
      />
      <CardContent className="clinic-summary-card__content">
        <Typography
          component="h3"
          variant="h6"
          className="clinic-summary-card__name"
        >
          {name}
        </Typography>
        <Typography component="p" className="clinic-summary-card__address">
          <LocationOnOutlined fontSize="small" aria-hidden="true" />
          <span>{clinic.memberAddress?.trim() || 'Address not provided'}</span>
        </Typography>
        <div className="clinic-summary-card__rating">
          {/* Empty stars indicate a planned feature, not a zero-star score. */}
          <span aria-hidden="true">
            <Rating value={null} readOnly size="small" />
          </span>
          <Typography component="span" variant="body2">
            Ratings coming soon
          </Typography>
        </div>
      </CardContent>
      {onViewDoctors && (
        <CardActions className="clinic-summary-card__actions">
          <Button
            endIcon={<ArrowForwardRounded />}
            onClick={() => onViewDoctors(clinic)}
            aria-label={`View doctors at ${name}`}
          >
            View doctors
          </Button>
        </CardActions>
      )}
    </Card>
  );
}
