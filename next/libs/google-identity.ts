// Only the Google Identity Services surface used by this app; no OAuth wrapper.
export interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    nonce: string;
    ux_mode: 'popup';
    auto_select: false;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'continue_with';
      shape: 'rectangular';
      width: number;
    },
  ): void;
}

function identity() {
  return (
    window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }
  ).google?.accounts?.id;
}

let loading: Promise<GoogleIdentity> | undefined;

export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const ready = identity();
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    loading = new Promise<GoogleIdentity>((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timeout);
        script.remove();
        reject(
          new Error(
            'Google couldn’t load. Check your connection and try again.',
          ),
        );
      };
      const timeout = setTimeout(fail, 15000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.onerror = fail;
      script.onload = () => {
        const api = identity();
        if (!api) {
          fail();
          return;
        }
        clearTimeout(timeout);
        resolve(api);
      };
      document.head.appendChild(script);
    }).catch((error) => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}
