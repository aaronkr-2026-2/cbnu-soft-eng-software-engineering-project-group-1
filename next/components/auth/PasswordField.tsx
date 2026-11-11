import { useState, type ChangeEvent } from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  maxLength: number;
  required?: boolean;
}

export function PasswordField(props: Props) {
  const [visible, setVisible] = useState(false);
  const { maxLength, ...field } = props;
  return (
    <TextField
      {...field}
      name={props.id}
      required={props.required ?? true}
      fullWidth
      type={visible ? 'text' : 'password'}
      slotProps={{
        htmlInput: { maxLength },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                disabled={props.disabled}
                aria-label={`${
                  visible ? 'Hide' : 'Show'
                } ${props.label.toLowerCase()}`}
                aria-pressed={visible}
                aria-controls={props.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
