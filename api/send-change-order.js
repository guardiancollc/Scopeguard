const {
  userFromBearer,
  getConnection,
  decrypt,
  refreshAccess
} = require('../lib/google-email');

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const usd = n =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(n || 0));

const enc = s => Buffer.from(s).toString('base64url');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await userFromBearer(req);

    const {
      to,
      changeOrder,
      project,
      company,
      approvalUrl
    } = req.body || {};

    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
      return res.status(400).json({
        error: 'A valid customer email is required.'
      });
    }

    if (!changeOrder || !project?.name) {
      return res.status(400).json({
        error: 'Change order information is incomplete.'
      });
    }

    if (!approvalUrl) {
      return res.status(400).json({
        error: 'Approval link is missing.'
      });
    }

    const conn = await getConnection(user.id);

    if (!conn) {
      return res.status(503).json({
        error:
          'Connect Gmail in Menu → Email Settings before sending change orders.'
      });
    }

    const access = await refreshAccess(
      decrypt(conn.refresh_token_encrypted)
    );

    const companyName =
      company?.name || 'ScopeGuard';

    const changeNumber =
      changeOrder.number ||
      changeOrder.changeOrderNumber ||
      changeOrder.id ||
      'Change Order';

    const description =
      changeOrder.description ||
      changeOrder.title ||
      changeOrder.reason ||
      'Additional work';

    const amount = Number(
      changeOrder.amount ??
      changeOrder.value ??
      changeOrder.estimatedValue ??
      changeOrder.proposedValue ??
      0
    );

    const subject =
      `${companyName} — Change Order ${changeNumber} — ${project.name}`;

    const text =
`Hello ${project.customer || ''},

A change order has been submitted for your review.

Project: ${project.name}
Change Order: ${changeNumber}

Description:
${description}

Change Order Total: ${usd(amount)}

Review and approve this change order here:
${approvalUrl}

Approval authorizes the work described in this change order.

${companyName}
${company?.phone || ''}
${conn.email}`;

const html = `
<!doctype html>
<html>
<body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#111827">

  <div style="max-width:720px;margin:24px auto;background:white;padding:32px;border-radius:14px">

    <div style="border-bottom:3px solid #111827;padding-bottom:18px">
      <h2 style="margin:0">${esc(companyName)}</h2>
      <div>${esc(company?.address || '')}</div>
      <div>
        ${esc(company?.phone || '')}
        ${company?.phone ? ' · ' : ''}
        ${esc(conn.email)}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;gap:20px;margin-top:24px">

      <div>
        <b>Prepared for</b><br>
        ${esc(project.customer || 'Customer')}<br>
        ${esc(to)}
      </div>

      <div style="text-align:right">
        <b>CHANGE ORDER ${esc(changeNumber)}</b>
      </div>

    </div>

    <div style="margin-top:24px;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">

      <b>Project:</b> ${esc(project.name)}

      <br><br>

      ${esc(description)}

    </div>

    <div style="text-align:right;font-size:26px;font-weight:800;margin-top:16px">
      Change Order Total: ${usd(amount)}
    </div>

    <div style="margin-top:30px;text-align:center">

      <a
        href="${esc(approvalUrl)}"
        style="
          display:inline-block;
          background:#b58a22;
          color:#ffffff;
          text-decoration:none;
          font-size:17px;
          font-weight:700;
          padding:15px 32px;
          border-radius:8px;
        "
      >
        APPROVE CHANGE ORDER
      </a>

    </div>

    <p style="margin-top:16px;text-align:center;color:#64748b;font-size:12px">
      Review the change order above and select Approve Change Order to authorize the additional work.
    </p>

    <p style="margin-top:28px;color:#64748b;font-size:12px">
      Sent from ${esc(conn.email)} using ScopeGuard.
    </p>

  </div>

</body>
</html>`;

    const boundary = `sg_change_${Date.now()}`;
    const alt = `alt_${Date.now()}`;

    const mime = [
      `From: ${companyName} <${conn.email}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',

      `Content-Type: multipart/alternative; boundary="${alt}"`,
      '',

      `--${alt}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text,

      `--${alt}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      html,

      `--${alt}--`

    ].join('\r\n');

    const gr = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: enc(mime)
        })
      }
    );

    const gj = await gr.json();

    if (!gr.ok) {
      throw new Error(
        gj?.error?.message ||
        'Gmail could not send this change order.'
      );
    }

    return res.json({
      ok: true,
      messageId: gj.id,
      from: conn.email
    });

  } catch (e) {

    console.error(e);

    return res.status(e.status || 500).json({
      error: e.message || 'Change order could not be sent.'
    });
  }
};
