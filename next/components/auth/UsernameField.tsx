import type { ChangeEvent } from 'react';
import { InputAdornment, TextField } from '@mui/material';
import { USERNAME_HELP } from '../../libs/username';

interface Props {
  id: string;
  name?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  disabled?: boolean;
  readOnly?: boolean;
  error?: boolean;
  helperText?: string;
  required?: boolean;
}

export function UsernameField({ readOnly = false, helperText, ...props }: Props) {
  return (
    <TextField
      {...props}
      name={props.name || props.id}
      label="Username"
      autoComplete={readOnly ? 'off' : 'username'}
      fullWidth
      helperText={
        helperText || (readOnly ? 'Your username is shown with @.' : USERNAME_HELP)
      }
      slotProps={{
        input: {
          readOnly,
          startAdornment: (
            <InputAdornment position="start" disablePointerEvents aria-hidden="true">
              @
            </InputAdornment>
          ),
        },
        htmlInput: {
          maxLength: 40,
          autoCapitalize: 'none',
          autoCorrect: 'off',
          spellCheck: false,
        },
      }}
    />
  );
}
