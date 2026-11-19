import Head from 'next/head';
import { MyCarePage } from '../components/booking/MyCarePage';
export default function WaitlistPage() {
  return (
    <>
      <Head>
        <title>My waitlist | MedConnect</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <MyCarePage kind="WAITLIST" />
    </>
  );
}
