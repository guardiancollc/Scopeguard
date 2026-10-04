const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const money = n =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(n || 0));

function dataImage(s) {
  try {
    if (!s || !s.startsWith('data:image/')) return null;
    return Buffer.from(s.split(',')[1] || '', 'base64');
  } catch {
    return null;
  }
}

function initials(name) {
  return String(name || 'Company')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase();
}

module.exports = function changeOrderPdf({
  changeOrder: co,
  project: p,
  company: c = {}
}) {
  return new Promise((resolve, reject) => {
    try {
      const number =
        co.number ||
        co.changeOrderNumber ||
        co.id ||
        'Change Order';

      const description =
        co.description ||
        co.title ||
        'Additional work';

      const requestedBy =
        co.requestedBy ||
        'Not specified';

      const amount = Number(
        co.amount ??
        co.value ??
        co.estimatedValue ??
        co.proposedValue ??
        0
      );

      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        info: {
          Title: `Change Order ${number}`,
          Author: c.name || 'ScopeGuard'
        }
      });

      const chunks = [];

      doc.on('data', x => chunks.push(x));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 612;
      const L = 60;
      const R = 552;

      const gold = '#D6A400';
      const dark = '#111827';
      const black = '#17191D';
      const gray = '#667085';
      const light = '#F1F2F4';
      const rule = '#D9DDE3';

      // GOLD TOP LINE
      doc.rect(0, 0, W, 8).fill(gold);

      // COMPANY HEADER
      const logo = dataImage(c.logoData);
      let brandX = L;

      if (logo) {
        try {
          doc.image(logo, L, 28, {
            fit: [64, 64],
            align: 'center',
            valign: 'center'
          });

          brandX = 138;
        } catch {}
      } else {
        doc.roundedRect(L, 28, 64, 64, 4)
          .fillAndStroke('#F4F4F4', black);

        doc.lineWidth(5)
          .strokeColor(gold)
          .roundedRect(L + 5, 33, 54, 54, 2)
          .stroke();

        doc.fillColor(black)
          .font('Helvetica-Bold')
          .fontSize(20)
          .text(initials(c.name), L, 49, {
            width: 64,
            align: 'center'
          });

        brandX = 138;
      }

      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text(
          String(c.name || 'Company').toUpperCase(),
          brandX,
          34,
          { width: 250 }
        );

      doc.fillColor('#333333')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(
          'CONCRETE  |  STRUCTURAL  |  SITE SOLUTIONS',
          brandX,
          76,
          { width: 285 }
        );

      const contact = [
        c.owner,
        c.phone,
        c.email,
        c.address
      ].filter(Boolean);

      let cy = 35;

      contact.forEach((v, n) => {
        doc.fillColor(dark)
          .font(n === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8)
          .text(String(v), 382, cy, {
            width: 170,
            align: 'right'
          });

        cy += 13;
      });

      doc.moveTo(L, 112)
        .lineTo(R, 112)
        .strokeColor('#CFD4DA')
        .lineWidth(1)
        .stroke();

      // TITLE
      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(29)
        .text('CHANGE ORDER', L, 137);

      // CUSTOMER
      doc.fillColor(gray)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('PREPARED FOR', L, 190);

      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(
          p.customer || 'Customer',
          L,
          208,
          { width: 235 }
        );

      doc.fillColor(gray)
        .font('Helvetica')
        .fontSize(10)
        .text(
          p.clientEmail || '',
          L,
          229,
          { width: 250 }
        );

      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Project:', L, 262);

      doc.font('Helvetica')
        .text(
          p.name || '',
          103,
          262,
          { width: 205 }
        );

      // CHANGE ORDER INFORMATION
      const mx = 332;
      const my = 137;
      const mw = 220;
      const rowH = 42;

      [
        ['Change Order #', number],
        ['Requested By', requestedBy],
        ['Status', 'Pending Approval']
      ].forEach((a, n) => {
        const rowY = my + n * rowH;

        doc.rect(mx, rowY, mw, rowH).fill(light);

        if (n) {
          doc.moveTo(mx, rowY)
            .lineTo(mx + mw, rowY)
            .strokeColor('#FFFFFF')
            .stroke();
        }

        doc.fillColor(gray)
          .font('Helvetica')
          .fontSize(8)
          .text(
            a[0],
            mx + 12,
            rowY + 8,
            { width: 82 }
          );

        doc.fillColor(dark)
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(
            String(a[1]),
            mx + 100,
            rowY + 8,
            { width: 105 }
          );
      });

      // DESCRIPTION HEADER
      let y = 305;

      doc.rect(L, y, R - L, 38).fill(black);

      doc.fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          'DESCRIPTION OF CHANGE',
          L + 12,
          y + 14
        );

      doc.text(
        'AMOUNT',
        R - 105,
        y + 14,
        {
          width: 93,
          align: 'right'
        }
      );

      y += 38;

      // DYNAMIC DESCRIPTION
      // This is important: the box grows with the text.
      doc.font('Helvetica')
        .fontSize(10);

      const descWidth = 335;

      const descHeight = doc.heightOfString(
        String(description),
        {
          width: descWidth,
          lineGap: 4
        }
      );

      const rowHeight = Math.max(
        76,
        descHeight + 32
      );

      doc.fillColor(dark)
        .font('Helvetica')
        .fontSize(10)
        .text(
          String(description),
          L + 12,
          y + 15,
          {
            width: descWidth,
            lineGap: 4
          }
        );

      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text(
          money(amount),
          R - 105,
          y + 16,
          {
            width: 93,
            align: 'right'
          }
        );

      doc.moveTo(L, y + rowHeight)
        .lineTo(R, y + rowHeight)
        .strokeColor(rule)
        .stroke();

      // REQUESTED BY / TOTAL
      const sy = y + rowHeight + 26;

      doc.fillColor(gray)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(
          'REQUESTED BY',
          L,
          sy
        );

      doc.fillColor(dark)
        .font('Helvetica')
        .fontSize(10)
        .text(
          String(requestedBy),
          L,
          sy + 18,
          { width: 250 }
        );

      const tx = 350;
      const tw = 202;

      doc.fillColor(dark)
        .font('Helvetica')
        .fontSize(10)
        .text(
          'Change Order Total',
          tx,
          sy,
          { width: 110 }
        );

      doc.font('Helvetica-Bold')
        .text(
          money(amount),
          tx + 110,
          sy,
          {
            width: 92,
            align: 'right'
          }
        );

      doc.moveTo(tx, sy + 23)
        .lineTo(tx + tw, sy + 23)
        .strokeColor(rule)
        .stroke();

      doc.rect(
        tx,
        sy + 33,
        tw,
        48
      ).fill(gold);

      doc.fillColor('#111111')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(
          'TOTAL',
          tx + 12,
          sy + 49,
          { width: 75 }
        );

      doc.text(
        money(amount),
        tx + 88,
        sy + 49,
        {
          width: 102,
          align: 'right'
        }
      );

      // FOOTER
      const fy = Math.max(690, sy + 95);
      const fh = 170;

      if (sy + 90 < fy) {
        doc.rect(0, fy, W, fh)
          .fill('#0A0D12');

        const footerPath = path.join(
          __dirname,
          '..',
          'scopeguard-logo.png'
        );

        if (fs.existsSync(footerPath)) {
          try {
            doc.save();

            doc.image(
              footerPath,
              -45,
              fy - 38,
              {
                width: W + 90
              }
            );

            doc.restore();
          } catch {}
        }

        doc.rect(0, fy, W, fh)
          .fillOpacity(0.76)
          .fill('#080B10')
          .fillOpacity(1);

        doc.fillColor('white')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(
            'BUILDING A STRONGER TOMORROW',
            L,
            fy + 47,
            {
              width: R - L,
              align: 'center'
            }
          );

        doc.fillColor(gold)
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(
            'SAFETY     •     QUALITY     •     INTEGRITY     •     RESULTS',
            L,
            fy + 78,
            {
              width: R - L,
              align: 'center'
            }
          );
      }

      doc.end();

    } catch (e) {
      reject(e);
    }
  });
};
