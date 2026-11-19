import Head from 'next/head';
import { MyCarePage } from '../components/booking/MyCarePage';
export default function AppointmentsPage() {
  return (
    <>
      <Head>
        <title>My appointments | MedConnect</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <MyCarePage kind="APPOINTMENT" />
    </>
  );
}
