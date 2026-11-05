import Head from 'next/head';
import { BookPage } from '../components/booking/BookPage';
export default function BookingPage() {
  return (
    <>
      <Head>
        <title>Book a visit | MedConnect</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <BookPage />
    </>
  );
}
