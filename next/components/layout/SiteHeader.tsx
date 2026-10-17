import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button, Collapse, IconButton } from '@mui/material';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import { clearSession, useSession } from '../../libs/auth-session';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="MedConnect home">
      <Image
        src="/logo.png"
        alt="MedConnect"
        width={200}
        height={74}
        priority
      />
    </Link>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const session = useSession();
  return (
    <header className="landing-header">
      <div className="container header-inner">
        <Brand />
        <nav className="desktop-navigation" aria-label="Main navigation">
          <Link href="/clinics">Find a clinic</Link>
          <Link href="/doctors">Find a doctor</Link>
          <a href="/#how-it-works">How it works</a>
          <a href="/#your-care">Your care</a>
        </nav>
        <div className="header-actions">
          <span className="sign-in-wrap">
            {session ? (
              <Button onClick={clearSession}>Sign out</Button>
            ) : (
              <Button component={Link} href="/auth">
                Sign in
              </Button>
            )}
          </span>
          <Button
            variant="contained"
            component={Link}
            href="/clinics"
            endIcon={<ArrowOutwardRounded />}
          >
            Find care
          </Button>
        </div>
        <IconButton
          className="mobile-menu-toggle"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <CloseRounded /> : <MenuRounded />}
        </IconButton>
      </div>
      <Collapse in={menuOpen}>
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="Mobile navigation"
        >
          <Link href="/clinics" onClick={() => setMenuOpen(false)}>
            Find a clinic
          </Link>
          <Link href="/doctors" onClick={() => setMenuOpen(false)}>
            Find a doctor
          </Link>
          <a href="/#how-it-works" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          <a href="/#your-care" onClick={() => setMenuOpen(false)}>
            Your care
          </a>
          {session ? (
            <Button
              onClick={() => {
                clearSession();
                setMenuOpen(false);
              }}
            >
              Sign out
            </Button>
          ) : (
            <Link href="/auth" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
          )}
        </nav>
      </Collapse>
    </header>
  );
}
