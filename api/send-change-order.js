const {
  userFromBearer,
  getConnection,
  decrypt,
  refreshAccess
} = require('../lib/google-email');

const changeOrderPdf = require('../lib/change-order-pdf');

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
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">

  <div style="max-width:680px;margin:0 auto;padding:24px 12px;">

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">

      <!-- HEADER -->
      <div style="background:#0b111b;padding:26px 30px;border-bottom:4px solid #c99720;">
        <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:.3px;">
          ${esc(companyName)}
        </div>

        <div style="margin-top:7px;font-size:13px;color:#cbd5e1;line-height:1.6;">
          ${company?.address ? esc(company.address) + '<br>' : ''}
          ${company?.phone ? esc(company.phone) + ' &nbsp; • &nbsp; ' : ''}
          ${esc(conn.email)}
        </div>
      </div>

      <!-- DOCUMENT TITLE -->
<div style="padding:24px 30px 18px 30px;">

  <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#b8860b;">
    CHANGE ORDER
  </div>

  <div style="margin-top:7px;font-size:30px;font-weight:800;color:#111827;line-height:1.15;">
    Change Order
  </div>

  <div style="margin-top:7px;font-size:16px;color:#64748b;">
    ${esc(project.name || 'Project')}
  </div>

</div>

<!-- INFO -->
<div style="padding:0 30px 24px 30px;">

  <table width="100%" cellpadding="0" cellspacing="0"
    style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">

    <tr>
      <td style="padding:16px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;">
          PREPARED FOR
        </div>
        <div style="margin-top:5px;font-size:16px;font-weight:700;color:#111827;">
          ${esc(project.customer || 'Customer')}
        </div>
        <div style="margin-top:3px;font-size:13px;color:#64748b;">
          ${esc(to)}
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:16px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;">
          PROJECT
        </div>
        <div style="margin-top:5px;font-size:16px;font-weight:700;color:#111827;">
          ${esc(project.name || 'Project')}
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:16px;">
        <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;">
          CHANGE ORDER
        </div>
        <div style="margin-top:5px;font-size:14px;color:#111827;">
          #${esc(changeNumber)}
        </div>
      </td>
    </tr>

  </table>

</div>
     
<!-- DESCRIPTION -->
<div style="padding:0 30px 14px 30px;">

  <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#64748b;margin-bottom:8px;">
    DESCRIPTION OF CHANGE
  </div>

  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.6;color:#1f2937;text-align:left;white-space:pre-line;">
${esc(changeOrder.description || 'Additional work')}
  </div>

  <div style="margin-top:14px;font-size:12px;font-weight:800;letter-spacing:1.4px;color:#64748b;">
    REQUESTED BY
  </div>

  <div style="margin-top:6px;font-size:15px;font-weight:600;color:#111827;">
    ${esc(changeOrder.requestedBy || 'Not specified')}
  </div>

</div>

      <!-- TOTAL -->
      <div style="padding:0 30px 26px 30px;">

        <div style="background:#0b111b;border-radius:14px;padding:22px;text-align:right;">

          <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#94a3b8;">
            CHANGE ORDER TOTAL
          </div>

          <div style="margin-top:5px;font-size:34px;font-weight:800;color:#ffffff;">
            ${Number(changeOrder.amount || 0).toLocaleString('en-US', {style:'currency', currency:'USD'})}
          </div>

        </div>

      </div>

      <!-- APPROVAL -->
      <div style="padding:0 30px 32px 30px;text-align:center;">

        <a href="${approvalUrl}"
          style="display:block;background:#c99720;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;letter-spacing:.5px;padding:18px 20px;border-radius:10px;">
          APPROVE CHANGE ORDER
        </a>

        <div style="margin-top:14px;font-size:12px;line-height:1.6;color:#64748b;">
          Selecting Approve Change Order confirms authorization for the additional work and change order amount shown above.
        </div>

      </div>

      <!-- FOOTER -->
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 30px;text-align:center;">

        <div style="font-size:12px;color:#64748b;">
          Change Order #${esc(changeNumber)}
        </div>

        <div style="margin-top:5px;font-size:11px;color:#94a3b8;">
          Sent from ${esc(conn.email)} using ScopeGuard
        </div>

      </div>

    </div>

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
