import Head from 'next/head';
import { AuthPage } from '../components/auth/AuthPage';

export default function Auth() {
  return (
    <>
      <Head>
        <title>Sign in or sign up | MedConnect</title>
        <meta
          name="description"
          content="Sign in to MedConnect or create your patient account."
        />
        <meta name="robots" content="noindex" />
      </Head>
      <AuthPage />
    </>
  );
}
