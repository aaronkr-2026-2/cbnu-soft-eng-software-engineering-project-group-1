import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { RecoveryPage } from '../components/auth/RecoveryPage';
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return { props: {} };
};
export default function Page() {
  return <><Head><title>Password recovery | MedConnect</title><meta name="robots" content="noindex" /><meta name="referrer" content="no-referrer" /></Head><RecoveryPage reset={true} /></>;
}
