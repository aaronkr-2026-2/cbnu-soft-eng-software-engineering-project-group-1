import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: { nativeColor: true },
  palette: {
    primary: {
      main: 'var(--color-primary)',
      contrastText: 'var(--color-white)',
    },
    secondary: { main: 'var(--color-secondary)' },
    background: { default: 'var(--color-white)' },
    text: {
      primary: 'var(--color-text)',
      secondary: 'var(--color-text-muted)',
    },
  },
  typography: {
    fontFamily: 'var(--font-body)',
    button: { textTransform: 'none', fontWeight: 700 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8, padding: '11px 22px' } },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
  },
});
