const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );

function layout(
  title: string,
  message: string,
  link: string,
  button: string,
  footer: string,
) {
  return {
    subject: title + ' — MedConnect',
    text: [
      title,
      message,
      `${button}: ${link}`,
      footer,
      'The MedConnect team',
    ].join('\n\n'),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;background:#f5f8fc;color:#172b4d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border:1px solid #d8e1ec;border-radius:16px"><tr><td style="padding:28px">
<img src="cid:medconnect-logo" alt="MedConnect" width="200" style="display:block;max-width:100%;height:auto">
<h1 style="color:#014b9f;font-size:26px;line-height:34px">${escape(title)}</h1>
<p style="font-size:16px;line-height:26px">${escape(message)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#014b9f;border-radius:8px"><a href="${escape(link)}" style="display:inline-block;padding:14px 24px;color:#fff;font-size:16px;font-weight:bold;text-decoration:none">${escape(button)}</a></td></tr></table>
<p style="font-size:14px;line-height:23px;word-break:break-all">Or open this address:<br><a href="${escape(link)}" style="color:#014b9f">${escape(link)}</a></p>
<p style="font-size:14px;line-height:23px;color:#526174">${escape(footer)}</p>
<p style="padding-top:20px;border-top:1px solid #d8e1ec;font-size:14px">The MedConnect team</p></td></tr></table></td></tr></table></body></html>`,
  };
}

export const passwordRecoveryEmail = (link: string) =>
  layout(
    'Reset your password',
    'Use the button below to choose a new MedConnect password. This link can be used once and expires 10 minutes after your request.',
    link,
    'Reset password',
    'Keep this link private. If you did not request it, ignore this email. Your password and sign-in sessions have not changed.',
  );

export const passwordChangedEmail = (signInLink: string) =>
  layout(
    'Your password was changed',
    'Your MedConnect password was reset and existing sign-in sessions were invalidated. Sign in with your new password.',
    signInLink,
    'Sign in',
    'If you did not make this change, request a new password reset from the MedConnect sign-in page to regain access.',
  );
