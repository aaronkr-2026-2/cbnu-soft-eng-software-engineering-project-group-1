export function verificationEmail(code: string) {
  const text = [
    'Welcome to MedConnect',
    'Verify your email address to finish creating your account.',
    `Enter this code on the signup page: ${code}`,
    'This code expires 10 minutes after your request. For your security, keep it private.',
    'If you didn’t request a MedConnect account, you can safely ignore this email.',
    'The MedConnect team',
  ].join('\n\n');

  // Inline styles and presentation tables support email clients. Colors follow
  // the existing MedConnect logo palette in next/styles/variables.scss.
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify your email for MedConnect</title></head>
<body style="margin:0;padding:0;background-color:#f5f8fc;color:#172b4d;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Verify your email to finish creating your MedConnect account.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f8fc;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #d8e1ec;border-radius:16px;">
        <tr><td style="padding:28px 28px 8px;">
          <img src="cid:medconnect-logo" alt="MedConnect" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:0;">
        </td></tr>
        <tr><td style="padding:16px 28px 32px;">
          <h1 style="margin:0 0 20px;color:#014b9f;font-size:26px;line-height:34px;font-weight:700;">Welcome to MedConnect</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:26px;">Verify your email address to finish creating your account.</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:26px;">Enter this code on the signup page.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:22px 12px;background-color:#f5f8fc;border:1px solid #d8e1ec;border-radius:10px;color:#014b9f;font-family:Consolas,'Courier New',monospace;font-size:34px;line-height:44px;letter-spacing:6px;font-weight:700;">${code}</td></tr>
          </table>
          <p style="margin:24px 0 20px;font-size:14px;line-height:23px;color:#526174;">This code expires <strong>10 minutes after your request</strong>. For your security, keep it private.</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:23px;color:#526174;">If you didn’t request a MedConnect account, you can safely ignore this email.</p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #d8e1ec;font-size:14px;line-height:23px;">The MedConnect team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: 'Verify your email for MedConnect', text, html };
}
