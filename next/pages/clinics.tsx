import Head from 'next/head';
import { ClinicsPage } from '../components/clinics/ClinicsPage';

export default function Clinics() {
  return (
    <>
      <Head>
        <title>Find a clinic | MedConnect</title>
        <meta
          name="description"
          content="Browse clinics, find their locations, and meet their doctors with MedConnect."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <ClinicsPage />
    </>
  );
}
