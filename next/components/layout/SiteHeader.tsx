import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Avatar, Button, Collapse, IconButton, Tooltip } from '@mui/material';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import { clearSession, useSession } from '../../libs/auth-session';
import { memberImageUrl } from '../../libs/api/image-url';

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
  const workspace =
    session && ['CLINIC', 'DOCTOR'].includes(session.member.memberType);
  return (
    <header className="landing-header">
      <div className="container header-inner">
        <Brand />
        <nav className="desktop-navigation" aria-label="Main navigation">
          <Link href="/clinics">Find a clinic</Link>
          <Link href="/doctors">Find a doctor</Link>
          {session && (
            <Link href={workspace ? '/workspace' : '/appointments'}>
              {workspace ? 'Workspace' : 'My Care'}
            </Link>
          )}
          {session?.member.memberType === 'USER' && (
            <Link href="/notifications">Notifications</Link>
          )}
        </nav>
        <div className="header-actions">
          {session && (
            <Tooltip title="My Page" describeChild arrow>
              <IconButton
                component={Link}
                href="/mypage"
                aria-label="My Page"
                color="primary"
              >
                <Avatar
                  src={
                    memberImageUrl(session.member.memberImage, '') || undefined
                  }
                  alt=""
                  sx={{
                    width: 35,
                    height: 35,
                    bgcolor: 'transparent',
                    color: 'inherit',
                  }}
                >
                  <AccountCircleOutlined fontSize="large" />
                </Avatar>
              </IconButton>
            </Tooltip>
          )}
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
          {session && (
            <Link href="/mypage" onClick={() => setMenuOpen(false)}>
              My Page
            </Link>
          )}
          {session && (
            <Link
              href={workspace ? '/workspace' : '/appointments'}
              onClick={() => setMenuOpen(false)}
            >
              {workspace ? 'Workspace' : 'My Care'}
            </Link>
          )}
          {session?.member.memberType === 'USER' && (
            <Link href="/notifications" onClick={() => setMenuOpen(false)}>
              Notifications
            </Link>
          )}
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
