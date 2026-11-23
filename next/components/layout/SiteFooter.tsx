import Link from 'next/link';
import { Brand } from './SiteHeader';

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="container footer-main">
        <div>
          <Brand />
          <p>Helping people currently in South Korea find clinics and doctors.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/clinics">Clinics</Link>
          <Link href="/doctors">Doctors</Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} MedConnect</span>
        <span>Care starts with a connection.</span>
      </div>
    </footer>
  );
}
