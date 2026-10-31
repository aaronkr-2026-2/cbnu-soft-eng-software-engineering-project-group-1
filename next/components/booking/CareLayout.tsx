import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
export function CareLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="landing site-shell care-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="container care-main">
        <div className="care-heading">
          <span className="eyebrow">YOUR CARE, AT YOUR PACE</span>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <nav className="care-navigation" aria-label="Patient care">
          <Link href="/book">Book a visit</Link>
          <Link href="/appointments">My appointments</Link>
          <Link href="/waitlist">My waitlist</Link>
        </nav>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
