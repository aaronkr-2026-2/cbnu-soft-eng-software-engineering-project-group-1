import { Alert, MenuItem, TextField } from '@mui/material';
import { profileFields } from '../../libs/profile-form';
import { UsernameField } from '../auth/UsernameField';
import { PasswordField } from '../auth/PasswordField';
import type { LoadedPersonalInfo } from './usePersonalInfo';

const locations = [
  'SEOUL',
  'INCHEON',
  'BUSAN',
  'JEJU',
  'DAEGU',
  'DAEJEON',
  'GWANGJU',
  'ULSAN',
  'SUWON',
  'SEJONG',
];

export function ProfileDetails({
  state,
  token,
}: {
  state: LoadedPersonalInfo;
  token: string;
}) {
  const {
    profile,
    draft,
    editing,
    busy,
    errors,
    username,
    change,
    firstField,
    setErrors,
  } = state;
  const clinic = profile.memberType === 'CLINIC';
  return (
    <div className="mypage__fields">
      {profileFields.map(([key, label, max]) =>
        key === 'memberNick' ? (
          <UsernameField
            key={key}
            id={key}
            value={draft.memberNick}
            onChange={(event) => change(key, event.target.value)}
            disabled={busy}
            readOnly={!editing}
            error={!!errors.memberNick}
            helperText={errors.memberNick}
            availability={
              editing
                ? {
                    state: username.state,
                    onCheck: () => {
                      setErrors((previous) => ({
                        ...previous,
                        memberNick: undefined,
                      }));
                      void username.check.check(draft.memberNick, token);
                    },
                  }
                : undefined
            }
          />
        ) : (
          <TextField
            key={key}
            id={key}
            name={key}
            label={label}
            value={draft[key]}
            fullWidth
            multiline={key === 'memberDesc'}
            minRows={key === 'memberDesc' ? 3 : undefined}
            inputRef={key === 'memberFullName' ? firstField : undefined}
            disabled={busy}
            error={!!errors[key]}
            helperText={
              errors[key] ||
              (key === 'memberPhone' && editing
                ? 'Include your country code.'
                : undefined)
            }
            onChange={(event) => change(key, event.target.value)}
            slotProps={{
              input: { readOnly: !editing },
              htmlInput: { maxLength: max },
            }}
          />
        ),
      )}
      <TextField
        id="memberEmail"
        label="Email"
        value={profile.memberEmail || ''}
        fullWidth
        slotProps={{ input: { readOnly: true } }}
        helperText={
          editing ? 'Email changes are currently unavailable.' : undefined
        }
      />
      {clinic && (
        <>
          <TextField
            id="clinicName"
            name="clinicName"
            label="Clinic name"
            value={draft.clinicName}
            disabled={busy}
            error={!!errors.clinicName}
            helperText={errors.clinicName}
            onChange={(event) => change('clinicName', event.target.value)}
            slotProps={{
              input: { readOnly: !editing },
              htmlInput: { maxLength: 150 },
            }}
          />
          {editing ? (
            <TextField
              select
              id="location"
              name="location"
              label="Location"
              value={draft.location}
              disabled={busy}
              error={!!errors.location}
              helperText={errors.location}
              onChange={(event) => change('location', event.target.value)}
            >
              <MenuItem value="" disabled>
                Choose a location
              </MenuItem>
              {locations.map((value) => (
                <MenuItem value={value} key={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label="Location"
              value={profile.location || ''}
              slotProps={{ input: { readOnly: true } }}
            />
          )}
        </>
      )}
      {profile.memberType === 'DOCTOR' && (
        <TextField
          label="Specializations"
          value={
            profile.doctorSpecializations
              ?.map((value) => value.replaceAll('_', ' '))
              .join(', ') || ''
          }
          slotProps={{ input: { readOnly: true } }}
        />
      )}
    </div>
  );
}

export function ProfilePasswordFields({
  state,
}: {
  state: LoadedPersonalInfo;
}) {
  const { profile, draft, busy, errors, change } = state;
  return (
    <div className="mypage__passwords">
      <h3>Change password</h3>
      {profile.canChangePassword ? (
        <>
          <p>
            Optional. Leave all three fields empty to keep your current
            password. Changing it will require you to sign in again.
          </p>
          <div className="mypage__fields">
            {(
              ['currentPassword', 'newPassword', 'confirmPassword'] as const
            ).map((key, index) => (
              <PasswordField
                key={key}
                id={key}
                label={
                  ['Current password', 'New password', 'Confirm new password'][
                    index
                  ]
                }
                value={draft[key]}
                onChange={(event) => change(key, event.target.value)}
                autoComplete={index === 0 ? 'current-password' : 'new-password'}
                maxLength={index === 0 ? 128 : 100}
                required={false}
                disabled={busy}
                error={!!errors[key]}
                helperText={errors[key]}
              />
            ))}
          </div>
        </>
      ) : (
        <Alert severity="info">
          Your password is managed by your sign-in provider.
        </Alert>
      )}
    </div>
  );
}
