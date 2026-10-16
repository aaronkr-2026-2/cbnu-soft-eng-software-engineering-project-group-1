import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { clearSession, useSession } from '../../libs/auth-session';
import { Button, Chip, Collapse, IconButton } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined';
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded';
import LocalHospitalOutlined from '@mui/icons-material/LocalHospitalOutlined';
import MenuRounded from '@mui/icons-material/MenuRounded';
import PeopleOutlineRounded from '@mui/icons-material/PeopleOutlineRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { ClinicDirectory } from './ClinicDirectory';

const steps = [
  {
    number: '01',
    icon: LocalHospitalOutlined,
    title: 'Find your clinic',
    text: 'Browse clinic profiles and find a place that feels right for your care.',
  },
  {
    number: '02',
    icon: PeopleOutlineRounded,
    title: 'Meet your doctor',
    text: 'Explore the clinic’s care team and learn about their specializations.',
  },
  {
    number: '03',
    icon: CalendarMonthOutlined,
    title: 'Plan your visit',
    text: 'Create your patient account and keep exploring. Online appointment booking is coming soon.',
  },
];

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="MedConnect home">
      <Image
        src="/logo.png"
        alt="MedConnect"
        width={200}
        height={74}
        priority
      />
    </a>
  );
}

function AppointmentIllustration() {
  return (
    <div
      className="hero-art"
      aria-label="Illustration of a sample appointment, not a real booking"
      role="img"
    >
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-cross cross-one">+</div>
      <div className="art-cross cross-two">+</div>
      <div className="connection-pill">
        <span />
        <FavoriteBorderRounded /> A little closer to better care
      </div>
      <div className="appointment-preview">
        <div className="preview-heading">
          <span className="preview-logo">
            <LocalHospitalOutlined />
          </span>
          <span>YOUR CARE, CONNECTED</span>
          <span className="preview-dots">•••</span>
        </div>
        <div className="preview-calendar">
          <CalendarMonthOutlined />
          <span>
            One step toward
            <br />
            <strong>feeling better.</strong>
          </span>
        </div>
        <div className="sample-label">SAMPLE APPOINTMENT</div>
        <div className="preview-details">
          <div className="preview-avatar">
            <PeopleOutlineRounded />
          </div>
          <div>
            <strong>Your doctor</strong>
            <span>Your chosen clinic</span>
          </div>
          <span className="preview-check">
            <CheckRounded />
          </span>
        </div>
        <div className="preview-slot">
          <CalendarMonthOutlined />
          <div>
            <strong>Monday, January 7</strong>
            <span>10:00–10:30 · Asia/Seoul</span>
          </div>
          <span className="preview-year">2030</span>
        </div>
        <div className="preview-footer">
          <span className="status-dot" />
          Pending confirmation<span>30 min</span>
        </div>
      </div>
      <div className="care-note">
        <span className="note-icon">
          <EventAvailableOutlined />
        </span>
        <div>
          <strong>A clearer next step.</strong>
          <span>From finding care to planning a visit.</span>
        </div>
      </div>
      <span className="illustration-caption">
        Illustration only · not a real appointment
      </span>
    </div>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const session = useSession();
  return (
    <div className="landing site-shell" id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-navigation" aria-label="Main navigation">
            <a href="#clinics">Find a clinic</a>
            <a href="#how-it-works">How it works</a>
            <a href="#your-care">Your care</a>
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
              href="#clinics"
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
            <a href="#clinics" onClick={() => setMenuOpen(false)}>
              Find a clinic
            </a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#your-care" onClick={() => setMenuOpen(false)}>
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
      <main id="main">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="eyebrow-line" />
                CARE STARTS WITH A CONNECTION
              </span>
              <h1 id="hero-title">
                Your next
                <br />
                appointment
                <br />
                <em>starts here.</em>
              </h1>
              <p>
                Explore clinics. Meet their doctors.
                <br />
                Take the next step toward a healthier you.
              </p>
              <div className="hero-actions">
                <Button
                  href="#clinics"
                  variant="contained"
                  endIcon={<ArrowForwardRounded />}
                >
                  Explore clinics
                </Button>
                <a className="text-link" href="#how-it-works">
                  How it works <ArrowOutwardRounded />
                </a>
              </div>
              <div className="hero-footnote">
                <span className="footnote-icon">
                  <CheckRounded />
                </span>
                Care for patients. Connections that matter.
              </div>
            </div>
            <AppointmentIllustration />
          </div>
        </section>
        <div className="care-strip">
          <div className="container">
            <span>
              <LocalHospitalOutlined />
              Clinics in one place
            </span>
            <span>
              <PeopleOutlineRounded />
              Know your care team
            </span>
            <span>
              <ScheduleRounded />A simpler next step
            </span>
          </div>
        </div>
        <section
          className="landing-steps section"
          id="how-it-works"
          aria-labelledby="steps-title"
        >
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="eyebrow">LESS GUESSWORK. MORE CLARITY.</span>
                <h2 id="steps-title">
                  Your path to care,
                  <br />
                  one step at a time.
                </h2>
              </div>
              <p>
                A little guidance goes a long way.
                <br />
                Here’s where to begin.
              </p>
            </div>
            <div className="steps-grid">
              {steps.map(({ number, icon: Icon, title, text }) => (
                <article className="step" key={number}>
                  <div className="step-top">
                    <span className="step-icon">
                      <Icon />
                    </span>
                    <span className="step-number">{number}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <ClinicDirectory />
        <section
          className="landing-your-care section"
          id="your-care"
          aria-labelledby="care-title"
        >
          <div className="container">
            <div className="your-care-panel">
              <div className="your-care-icon">
                <FavoriteBorderRounded />
              </div>
              <div>
                <Chip label="COMING SOON" size="small" variant="outlined" />
                <h2 id="care-title">
                  Less to keep track of.
                  <br />
                  More room to feel better.
                </h2>
                <p>
                  We’re bringing your appointments and their statuses into one
                  place, so you can focus on your next visit.
                </p>
                <p className="upcoming-note">
                  Appointment management and online booking are on the way.
                </p>
              </div>
              <a
                href="#clinics"
                className="care-panel-link"
                aria-label="Explore clinics"
              >
                <ArrowOutwardRounded />
              </a>
            </div>
          </div>
        </section>
        <section className="landing-final">
          <div className="container">
            <span className="eyebrow">YOUR NEXT STEP STARTS WITH YOU</span>
            <h2>Let’s find your connection.</h2>
            <Button
              variant="contained"
              href="#clinics"
              endIcon={<ArrowForwardRounded />}
            >
              Explore clinics
            </Button>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="container footer-main">
          <div>
            <Brand />
            <p>Connecting people with their next step in care.</p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#clinics">Clinics</a>
            <a href="#how-it-works">How it works</a>
            <a href="#your-care">Your care</a>
          </nav>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} MedConnect</span>
          <span>Care starts with a connection.</span>
        </div>
      </footer>
    </div>
  );
}
