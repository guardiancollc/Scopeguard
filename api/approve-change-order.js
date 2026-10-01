const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://yqgovlrxyizobsnqycko.supabase.co';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const esc = (value = '') =>
  String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

const money = value =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));

const supabaseHeaders = {
  apikey: SERVICE_ROLE_KEY || '',
  Authorization: `Bearer ${SERVICE_ROLE_KEY || ''}`
};

async function getChangeOrder(token) {
  const select = [
    'id',
    'project_id',
    'title',
    'description',
    'reason',
    'note',
    'requested_by',
    'estimated_value',
    'proposed_value',
    'status',
    'approval_token',
    'approved_at'
  ].join(',');

  const url =
    `${SUPABASE_URL}/rest/v1/extra_work` +
    `?approval_token=eq.${encodeURIComponent(token)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: supabaseHeaders
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Change order lookup failed:', details);
    throw new Error('Could not load this change order.');
  }

  const rows = await response.json();
  return rows?.[0] || null;
}

async function getProject(projectId) {
  if (!projectId) return null;

  const select = 'id,name,customer';

  const url =
    `${SUPABASE_URL}/rest/v1/projects` +
    `?id=eq.${encodeURIComponent(projectId)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: supabaseHeaders
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Project lookup failed:', details);
    return null;
  }

  const rows = await response.json();
  return rows?.[0] || null;
}

function layout(content, title = 'Change Order') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${esc(title)} | ScopeGuard</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 28px 16px;
      background: #070a0f;
      color: #f4f6f8;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Arial,
        sans-serif;
    }

    .wrap {
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
    }

    .brand {
      text-align: center;
      color: #c99b28;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: .4px;
      margin-bottom: 22px;
    }

    .card {
      background: #0e131b;
      border: 1px solid #262d38;
      border-radius: 18px;
      padding: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
    }

    .eyebrow {
      color: #c99b28;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1.5px;
    }

    h1 {
      margin: 8px 0 6px;
      font-size: 29px;
    }

    .project {
      color: #aeb7c4;
      margin-bottom: 26px;
    }

    .row {
      padding: 15px 0;
      border-bottom: 1px solid #252c36;
    }

    .row:last-child {
      border-bottom: 0;
    }

    .label {
      display: block;
      color: #8f99a7;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .7px;
      margin-bottom: 6px;
    }

    .value {
      color: #f5f7fa;
      line-height: 1.55;
      white-space: pre-wrap;
    }

    .total {
      margin-top: 24px;
      padding: 20px;
      background: #151b24;
      border: 1px solid #343c48;
      border-radius: 12px;
      text-align: right;
    }

    .total-label {
      color: #aeb7c4;
      font-size: 13px;
      font-weight: 700;
    }

    .total-value {
      color: #ffffff;
      font-size: 30px;
      font-weight: 800;
      margin-top: 4px;
    }

    .approval {
      margin-top: 28px;
      text-align: center;
    }

    .approve-button {
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: 17px 24px;
      background: #b58a22;
      color: #ffffff;
      font-size: 17px;
      font-weight: 800;
      cursor: pointer;
    }

    .approve-button:hover {
      opacity: .92;
    }

    .fine-print {
      color: #7f8997;
      font-size: 12px;
      line-height: 1.5;
      margin-top: 14px;
    }

    .message {
      text-align: center;
      padding: 18px 0 6px;
    }

    .success {
      color: #58d68d;
    }

    .error {
      color: #ff7676;
    }

    .icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
  </style>
</head>

<body>
  <div class="wrap">
    <div class="brand">ScopeGuard</div>

    <div class="card">
      ${content}
    </div>
  </div>
</body>
</html>`;
}

function errorPage(title, message, statusCode, res) {
  return res.status(statusCode).send(
    layout(
      `
      <div class="message">
        <div class="icon error">!</div>
        <h1 class="error">${esc(title)}</h1>
        <p class="project">${esc(message)}</p>
      </div>
      `,
      title
    )
  );
}

module.exports = async (req, res) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is missing.');

      return errorPage(
        'Service unavailable',
        'Change order approval is temporarily unavailable.',
        500,
        res
      );
    }

    const token =
      String(
        req.method === 'POST'
          ? req.body?.token || ''
          : req.query?.token || ''
      ).trim();

    if (!token) {
      return errorPage(
        'Invalid approval link',
        'This change order approval link is missing its secure token.',
        400,
        res
      );
    }

    const changeOrder = await getChangeOrder(token);

    if (!changeOrder) {
      return errorPage(
        'Change order not found',
        'This approval link is invalid or the change order no longer exists.',
        404,
        res
      );
    }

    /*
      GET ONLY DISPLAYS THE CHANGE ORDER.

      This is intentional. Email-security systems may automatically
      open links. A GET request must never approve the change order.
    */
    if (req.method === 'GET') {
      const project = await getProject(changeOrder.project_id);

      const projectName =
        project?.name || 'Project';

      const customer =
        project?.customer || 'Customer';

      const description =
        changeOrder.description ||
        changeOrder.title ||
        changeOrder.note ||
        changeOrder.reason ||
        'Additional work';

      const requestedBy =
        changeOrder.requested_by ||
        'Not specified';

      const amount = Number(
        changeOrder.proposed_value ??
        changeOrder.estimated_value ??
        0
      );

      const alreadyApproved =
        changeOrder.status === 'approved' ||
        Boolean(changeOrder.approved_at);

      if (alreadyApproved) {
        return res.status(200).send(
          layout(
            `
            <div class="message">
              <div class="icon success">✓</div>
              <div class="eyebrow">CHANGE ORDER</div>

              <h1 class="success">
                Already Approved
              </h1>

              <p class="project">
                This change order has already been approved.
                No further action is required.
              </p>
            </div>
            `,
            'Change Order Approved'
          )
        );
      }

      return res.status(200).send(
        layout(
          `
          <div class="eyebrow">
            CHANGE ORDER REVIEW
          </div>

          <h1>
  Change Order
</h1>

          <div class="project">
            ${esc(projectName)}
          </div>

<div style="margin-top:28px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;color:#111827;">

  <div style="padding:20px 22px;border-bottom:1px solid #e2e8f0;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#64748b;">
      PREPARED FOR
    </div>
    <div style="margin-top:7px;font-size:18px;font-weight:700;">
      ${esc(customer)}
    </div>
  </div>

  <div style="padding:20px 22px;border-bottom:1px solid #e2e8f0;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#64748b;">
      PROJECT
    </div>
    <div style="margin-top:7px;font-size:18px;font-weight:700;">
      ${esc(projectName)}
    </div>
  </div>

  <div style="padding:20px 22px;border-bottom:1px solid #e2e8f0;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#64748b;">
      DESCRIPTION OF CHANGE
    </div>

    <div style="margin-top:14px;font-size:16px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;text-align:left;">
${esc(description)}
    </div>
  </div>

  <div style="padding:20px 22px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#64748b;">
      REQUESTED BY
    </div>

    <div style="margin-top:7px;font-size:16px;line-height:1.6;overflow-wrap:anywhere;text-align:left;">
      ${esc(requestedBy)}
    </div>
  </div>

</div>

<div class="total">
  <div class="total-label">
    CHANGE ORDER TOTAL
  </div>

  <div class="total-value">
    ${money(amount)}
  </div>
</div>
          
          <div class="approval">
            <form
              method="POST"
              action="/api/approve-change-order"
            >
              <input
                type="hidden"
                name="token"
                value="${esc(token)}"
              >

              <button
                type="submit"
                class="approve-button"
              >
                APPROVE CHANGE ORDER
              </button>
            </form>

            <div class="fine-print">
              By selecting Approve Change Order, you confirm
              authorization for the additional work and the
              change order total shown above.
            </div>
          </div>
          `,
          'Review Change Order'
        )
      );
    }

    /*
      POST IS THE ONLY REQUEST THAT CAN APPROVE.
    */
    if (req.method === 'POST') {
      if (
        changeOrder.status === 'approved' ||
        changeOrder.approved_at
      ) {
        return res.status(200).send(
          layout(
            `
            <div class="message">
              <div class="icon success">✓</div>

              <h1 class="success">
                Already Approved
              </h1>

              <p class="project">
                This change order was already approved.
                No further action is required.
              </p>
            </div>
            `,
            'Already Approved'
          )
        );
      }

      const approvedAt = new Date().toISOString();

      const url =
        `${SUPABASE_URL}/rest/v1/extra_work` +
        `?id=eq.${encodeURIComponent(changeOrder.id)}` +
        `&approval_token=eq.${encodeURIComponent(token)}`;

      const response = await fetch(url, {
        method: 'PATCH',

        headers: {
          ...supabaseHeaders,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },

        body: JSON.stringify({
          status: 'approved',
          approved_at: approvedAt
        })
      });

      if (!response.ok) {
        const details = await response.text();

        console.error(
          'Change order approval update failed:',
          details
        );

        throw new Error(
          'Could not record the change order approval.'
        );
      }

      const updated = await response.json();

      if (!updated?.length) {
        throw new Error(
          'The change order was not updated.'
        );
      }

      return res.status(200).send(
        layout(
          `
          <div class="message">
            <div class="icon success">✓</div>

            <div class="eyebrow">
              APPROVAL RECORDED
            </div>

            <h1 class="success">
              Change Order Approved
            </h1>

            <p class="project">
              Thank you. Your approval has been recorded
              successfully. The contractor can now see this
              change order as approved in ScopeGuard.
            </p>
          </div>
          `,
          'Change Order Approved'
        )
      );
    }

    res.setHeader('Allow', 'GET, POST');

    return errorPage(
      'Request not allowed',
      'This request method is not supported.',
      405,
      res
    );

  } catch (error) {
    console.error(
      'approve-change-order error:',
      error
    );

    return errorPage(
      'Approval could not be completed',
      'We could not process this change order. Please contact the contractor or try again.',
      500,
      res
    );
  }
};
