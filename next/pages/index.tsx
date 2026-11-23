import Head from 'next/head';
import { LandingPage } from '../components/landing/LandingPage';

export default function Home() {
  return (
    <>
      <Head>
        <title>MedConnect | Your next appointment starts here</title>
        <meta
          name="description"
          content="Explore clinics, discover their doctors, and take the next step toward your next visit with MedConnect."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <LandingPage />
    </>
  );
}
