import { DirectoryPage } from '../directory/DirectoryPage';
import { DoctorCard } from './DoctorCard';

export function DoctorsPage() {
  return (
    <DirectoryPage
      kind="doctors"
      renderEntry={(doctor) => <DoctorCard key={doctor._id} doctor={doctor} />}
    />
  );
}
