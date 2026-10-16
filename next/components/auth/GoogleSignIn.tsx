import { Button } from '@mui/material';
import Google from '@mui/icons-material/Google';

// Future Google Identity Services integration stays in this component.
// No OAuth SDK, nonce request, credential handler, or navigation is loaded yet.
export function GoogleSignIn() {
  return (
    <div className="auth-google">
      <Button
        variant="outlined"
        disabled
        startIcon={<Google />}
        aria-describedby="google-coming-soon"
      >
        Continue with Google
      </Button>
      <span id="google-coming-soon">Coming soon</span>
    </div>
  );
}
