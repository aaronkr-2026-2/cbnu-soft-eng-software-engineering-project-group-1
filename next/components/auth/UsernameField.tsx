import type { ChangeEvent } from 'react';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { Button, InputAdornment, TextField } from '@mui/material';
import type { UsernameCheckState } from '../../libs/username-check';
import { usernameError, USERNAME_HELP } from '../../libs/username';

interface Props {
  id: string;
  name?: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  disabled?: boolean;
  readOnly?: boolean;
  error?: boolean;
  helperText?: string;
  required?: boolean;
  availability?: { state: UsernameCheckState; onCheck: () => void };
}

export function UsernameField({
  readOnly = false,
  helperText,
  availability,
  ...props
}: Props) {
  const status = availability?.state;
  const checking = status?.status === 'checking';
  const failed = status && ['taken', 'invalid'].includes(status.status);
  return (
    <div className="username-field">
      <div className="username-field__controls">
        <TextField
          {...props}
          name={props.name || props.id}
          label="Username"
          error={props.error || !!failed}
          autoComplete={readOnly ? 'off' : 'username'}
          fullWidth
          helperText={
            helperText ||
            (readOnly ? 'Your username is shown with @.' : USERNAME_HELP)
          }
          slotProps={{
            input: {
              readOnly,
              startAdornment: (
                <InputAdornment
                  position="start"
                  disablePointerEvents
                  aria-hidden="true"
                >
                  @
                </InputAdornment>
              ),
            },
            htmlInput: {
              maxLength: 40,
              autoCapitalize: 'none',
              autoCorrect: 'off',
              spellCheck: false,
              'aria-describedby': `${props.id}-helper-text${availability && !readOnly ? ` ${props.id}-availability` : ''}`,
            },
          }}
        />
        {availability && !readOnly && (
          <Button
            type="button"
            variant="outlined"
            disabled={
              props.disabled || checking || !!usernameError(props.value)
            }
            onClick={availability.onCheck}
            aria-label="Check username availability"
          >
            {checking ? 'Checking…' : 'Check'}
          </Button>
        )}
      </div>
      {availability && !readOnly && (
        <p
          id={`${props.id}-availability`}
          role="status"
          aria-live="polite"
          className={`username-field__status username-field__status--${status?.status}`}
        >
          {status?.status === 'available' && (
            <CheckRounded aria-hidden="true" fontSize="small" />
          )}
          {status?.message ||
            'Check availability before saving a new username.'}
        </p>
      )}
    </div>
  );
}
