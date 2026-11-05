import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { PublicMember } from '../../libs/api/public-members';
import { DirectoryPage } from '../directory/DirectoryPage';
import { ClinicCard } from './ClinicCard';
import { DoctorsDialog } from './DoctorsDialog';

export function ClinicsPage() {
  const [selected, setSelected] = useState<PublicMember | null>(null);
  const router = useRouter();
  useEffect(() => {
    const close = () => setSelected(null);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);
  return (
    <DirectoryPage
      kind="clinics"
      renderEntry={(clinic) => (
        <ClinicCard
          key={clinic._id}
          clinic={clinic}
          onViewDoctors={setSelected}
        />
      )}
    >
      {selected && (
        <DoctorsDialog
          key={selected._id}
          clinic={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </DirectoryPage>
  );
}
