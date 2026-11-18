import { useEffect } from 'react';
import { initializeSession } from '../libs/auth-session';
import type { AppProps } from 'next/app';
import { AppCacheProvider } from '@mui/material-nextjs/v16-pagesRouter';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../libs/theme';
import '../styles/style.scss';

export default function App(props: AppProps) {
  const { Component, pageProps } = props;
  useEffect(() => {
    if (!['/forgot-password', '/reset-password'].includes(props.router.pathname)) initializeSession();
  }, [props.router.pathname]);
  return (
    <AppCacheProvider {...props}>
      <ThemeProvider theme={theme}>
        <Component {...pageProps} />
      </ThemeProvider>
    </AppCacheProvider>
  );
}
