import Head from 'next/head';
import { DoctorsPage } from '../components/doctors/DoctorsPage';

export default function Doctors() {
  return (
    <>
      <Head>
        <title>Find a doctor | MedConnect</title>
        <meta
          name="description"
          content="Explore doctors and their specializations with MedConnect."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <DoctorsPage />
    </>
  );
}
