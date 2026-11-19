import { useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Alert, Button } from '@mui/material';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';

export default function AccountDeletedPage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="landing site-shell mypage">
      <Head>
        <title>Account deleted | MedConnect</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="container mypage__main">
        <h1 ref={heading} tabIndex={-1}>
          Account deleted
        </h1>
        <div className="mypage__card">
          <Alert severity="success">
            Your account access is permanently closed.
          </Alert>
          <Button component={Link} href="/" variant="contained">
            Return to home
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
