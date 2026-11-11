import Head from 'next/head';
import { NotificationsPage } from '../components/notifications/NotificationsPage';
export default function Notifications() {
  return (
    <>
      <Head>
        <title>Notifications | MedConnect</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <NotificationsPage />
    </>
  );
}
