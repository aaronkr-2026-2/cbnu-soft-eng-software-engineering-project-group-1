import Link from 'next/link';
import { Brand } from './SiteHeader';

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="container footer-main">
        <div>
          <Brand />
          <p>Connecting people with their next step in care.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/clinics">Clinics</Link>
          <Link href="/doctors">Doctors</Link>
          <a href="/#how-it-works">How it works</a>
          <a href="/#your-care">Your care</a>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} MedConnect</span>
        <span>Care starts with a connection.</span>
      </div>
    </footer>
  );
}
