// Email Service for QuoteCraft
// Handles SMTP transport verification and message delivery using nodemailer.

const nodemailer = require('nodemailer');

function diagnoseSmtpError(err, config = {}) {
  const code = (err && err.code) || '';
  const response = (err && err.response) || '';
  const message = (err && err.message) || String(err || '');
  const lowerMsg = message.toLowerCase();

  // 1. DNS / Host lookup failure (e.g. typos in host like smtp.etherealemail)
  if (code === 'EDNS' || code === 'ENOTFOUND' || lowerMsg.includes('enotfound') || lowerMsg.includes('getaddrinfo')) {
    return {
      type: 'DNS_ERROR',
      title: 'Host Not Found',
      detail: `Could not find server "${config.smtp_host || 'unknown'}". Please check the host spelling (for example: "smtp.ethereal.email" or "smtp.gmail.com").`,
      raw: message,
    };
  }

  // 2. Authentication failure
  if (code === 'EAUTH' || response.includes('535') || lowerMsg.includes('badcredentials') || lowerMsg.includes('username and password not accepted') || lowerMsg.includes('authentication failed')) {
    const host = (config.smtp_host || '').toLowerCase();
    let providerAdvice = 'If using Gmail, Microsoft Outlook, or Yahoo, you must generate an App Password in your account security settings rather than using your regular login password.';
    if (host.includes('gmail')) {
      providerAdvice = 'Gmail requires 2-Step Verification enabled and a 16-character App Password created at myaccount.google.com/apppasswords.';
    } else if (host.includes('outlook') || host.includes('office365')) {
      providerAdvice = 'Microsoft / Outlook requires an App Password generated in your Microsoft Account Security settings.';
    } else if (host.includes('yahoo')) {
      providerAdvice = 'Yahoo requires generating an App Password in Yahoo Account Security.';
    } else if (host.includes('ethereal')) {
      providerAdvice = 'For Ethereal, verify that your username and password match the ones generated on ethereal.email.';
    }

    return {
      type: 'AUTH_FAILED',
      title: 'Authentication Failed',
      detail: `Your SMTP server rejected the username or password. ${providerAdvice}`,
      raw: message,
    };
  }

  // 3. Connection timeout / Refused
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || lowerMsg.includes('econnrefused') || lowerMsg.includes('etimedout')) {
    return {
      type: 'CONNECTION_FAILED',
      title: 'Connection Failed',
      detail: `Could not connect to SMTP server at ${config.smtp_host || 'specified host'}:${config.smtp_port || ''}. Please check your internet connection, confirm the port number, and ensure the server is online.`,
      raw: message,
    };
  }

  // 4. SSL / TLS negotiation failure
  if (lowerMsg.includes('wrong version number') || lowerMsg.includes('handshake') || lowerMsg.includes('ssl') || lowerMsg.includes('tls') || lowerMsg.includes('certificate')) {
    return {
      type: 'SECURITY_ERROR',
      title: 'SSL/TLS Negotiation Error',
      detail: `Secure handshake failed. If using port 465, enable SSL/TLS. If using port 587 or 25, disable SSL/TLS to use STARTTLS.`,
      raw: message,
    };
  }

  // 5. Socket error fallback
  if (code === 'ESOCKET') {
    return {
      type: 'SOCKET_ERROR',
      title: 'Connection Interrupted',
      detail: `Socket error connecting to ${config.smtp_host || 'server'}:${config.smtp_port || ''}. Check whether SSL/TLS matches your port (port 465 requires SSL/TLS, port 587 requires STARTTLS).`,
      raw: message,
    };
  }

  return {
    type: 'GENERAL_ERROR',
    title: 'SMTP Error',
    detail: message || 'Failed to communicate with SMTP server.',
    raw: message,
  };
}

function createTransporter(config) {
  const isSecure = Boolean(config.smtp_secure) || Number(config.smtp_port) === 465;
  let pass = config.smtp_password || '';
  if (config.smtp_host && config.smtp_host.toLowerCase().includes('gmail')) {
    pass = pass.replace(/\s+/g, '');
  }

  return nodemailer.createTransport({
    host: config.smtp_host,
    port: Number(config.smtp_port) || (isSecure ? 465 : 587),
    secure: isSecure,
    auth: {
      user: (config.smtp_username || '').trim(),
      pass: pass,
    },
    tls: {
      // Support environments with SSL-inspecting antivirus or corporate proxies
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
}

async function verifySmtpConnection(config) {
  if (!config.smtp_host || !config.smtp_host.trim()) {
    return { ok: false, error: 'SMTP host is required.' };
  }
  if (!config.smtp_username || !config.smtp_username.trim()) {
    return { ok: false, error: 'SMTP username is required.' };
  }
  if (!config.smtp_password) {
    return { ok: false, error: 'SMTP password is required.' };
  }

  const transporter = createTransporter(config);
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const diag = diagnoseSmtpError(err, config);
    return { ok: false, error: diag.detail, diagnosis: diag };
  }
}

async function sendTestEmail(config, recipient) {
  const targetRecipient = (recipient && recipient.trim()) || config.sender_email;
  if (!targetRecipient) {
    return { ok: false, error: 'Recipient email address is required.' };
  }

  if (!config.smtp_host || !config.smtp_host.trim()) {
    return { ok: false, error: 'Please configure and save your SMTP host first.' };
  }
  if (!config.smtp_username || !config.smtp_username.trim()) {
    return { ok: false, error: 'Please configure and save your SMTP username first.' };
  }
  if (!config.smtp_password) {
    return { ok: false, error: 'No SMTP password configured. Please enter your password or app password.' };
  }

  const transporter = createTransporter(config);
  const now = new Date();
  const fromAddress = config.sender_name && config.sender_name.trim()
    ? `"${config.sender_name.trim()}" <${config.sender_email || config.smtp_username}>`
    : (config.sender_email || config.smtp_username);

  const isSecure = Boolean(config.smtp_secure) || Number(config.smtp_port) === 465;

  const mailOptions = {
    from: fromAddress,
    to: targetRecipient,
    subject: 'QuoteCraft SMTP Test — Configuration Successful',
    text: `Congratulations! Your SMTP email configuration in QuoteCraft is working properly.\n\nServer: ${config.smtp_host}:${config.smtp_port} (${isSecure ? 'SSL/TLS' : 'STARTTLS'})\nSender: ${config.sender_email || config.smtp_username}\nRecipient: ${targetRecipient}\nTimestamp: ${now.toISOString()}\n\nYou can now send quotes and invoices directly from QuoteCraft.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; background: #ffffff; border: 1px solid #e1e4e8; border-radius: 8px; color: #24292e;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <h2 style="color: #2da44e; margin: 0; font-size: 20px; font-weight: 600;">✔ SMTP Test Successful</h2>
        </div>
        <p style="font-size: 14px; line-height: 1.5; color: #444d56;">
          Your QuoteCraft email configuration is verified and working properly. You are ready to deliver professional quotes and invoices directly through your own email account.
        </p>
        <div style="background: #f6f8fa; border: 1px solid #eaecef; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #586069; width: 140px; font-weight: 600;">SMTP Server:</td>
              <td style="padding: 4px 0; color: #24292e;">${config.smtp_host}:${config.smtp_port} (${isSecure ? 'SSL/TLS' : 'STARTTLS'})</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #586069; font-weight: 600;">Sender Address:</td>
              <td style="padding: 4px 0; color: #24292e;">${fromAddress}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #586069; font-weight: 600;">Delivered To:</td>
              <td style="padding: 4px 0; color: #24292e;">${targetRecipient}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #586069; font-weight: 600;">Timestamp:</td>
              <td style="padding: 4px 0; color: #24292e;">${now.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        <p style="font-size: 12px; color: #6a737d; margin: 0; border-top: 1px solid #eaecef; padding-top: 16px;">
          Sent from <strong>QuoteCraft</strong> — Invoicing &amp; Quotes for Freelancers and Small Businesses.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      ok: true,
      messageId: info.messageId,
      recipient: targetRecipient,
      timestamp: now.toISOString(),
    };
  } catch (err) {
    const diag = diagnoseSmtpError(err, config);
    return {
      ok: false,
      error: diag.detail,
      diagnosis: diag,
    };
  }
}

module.exports = {
  createTransporter,
  verifySmtpConnection,
  sendTestEmail,
  diagnoseSmtpError,
};
