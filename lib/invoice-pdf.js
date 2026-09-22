const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const money = n =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
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

module.exports = function invoicePdf({ invoice: i, project: p, company: c = {} }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        info: {
          Title: `Invoice ${i.number || ''}`,
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

      // Gold top line
      doc.rect(0, 0, W, 8).fill(gold);

      // COMPANY HEADER
      const logo = dataImage(c.logoData);
      let brandX = L;

      if (logo) {
        try {
          doc.image(logo, L, 28, { fit: [64, 64] });
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
        .characterSpacing(1.1)
        .text(
          'CONCRETE  |  STRUCTURAL  |  SITE SOLUTIONS',
          brandX,
          76,
          { width: 285 }
        );

      doc.characterSpacing(0);

      const contact = [
        c.owner,
        c.phone,
        c.email,
        c.address
      ].filter(Boolean);

      doc.fillColor(dark).fontSize(8);

      let cy = 35;

      contact.forEach((v, n) => {
        doc.font(n === 0 ? 'Helvetica-Bold' : 'Helvetica')
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

      // INVOICE TITLE
      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(31)
        .text('INVOICE', L, 137);

      // BILL TO
      doc.fillColor(gray)
        .font('Helvetica-Bold')
        .fontSize(8)
        .characterSpacing(1)
        .text('BILL TO', L, 190);

      doc.characterSpacing(0);

      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(p.customer || 'Customer', L, 208, {
          width: 235
        });

      doc.font('Helvetica')
        .fontSize(11)
        .text(
          i.clientEmail || p.clientEmail || '',
          L,
          229,
          { width: 250 }
        );

      doc.font('Helvetica-Bold')
        .fontSize(11)
        .text('Project:', L, 262);

      doc.font('Helvetica')
        .text(p.name || '', 103, 262, {
          width: 205
        });

      // INVOICE INFORMATION BOX
      const mx = 332;
      const my = 137;
      const mw = 220;
      const rowH = 42;

      [
        ['Invoice #', i.number || ''],
        ['Invoice Date', i.date || ''],
        ['Due Date', i.dueDate || 'Upon receipt']
      ].forEach((a, n) => {
        const y = my + n * rowH;

        doc.rect(mx, y, mw, rowH).fill(light);

        if (n) {
          doc.moveTo(mx, y)
            .lineTo(mx + mw, y)
            .strokeColor('#FFFFFF')
            .stroke();
        }

        doc.fillColor(gray)
          .font('Helvetica')
          .fontSize(9)
          .text(a[0], mx + 12, y + 8, {
            width: 82
          });

        doc.fillColor(dark)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(String(a[1]), mx + 100, y + 8, {
            width: 105
          });
      });

      // DESCRIPTION TABLE
      let y = 305;

      doc.rect(L, y, R - L, 38).fill(black);

      doc.fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(9)
        .characterSpacing(0.8)
        .text('DESCRIPTION', L + 12, y + 14);

      doc.text('AMOUNT', R - 105, y + 14, {
        width: 93,
        align: 'right'
      });

      doc.characterSpacing(0);

      y += 38;

      const gross =
        Number(i.amount || 0) +
        Number(i.retainage || 0);

      const paid = Number(i.paidAmount || 0);

      const balance = Math.max(
        0,
        Number(i.amount || 0) - paid
      );

      doc.fillColor(dark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(
          i.description || 'Project progress billing',
          L + 12,
          y + 16,
          { width: 320 }
        );

      doc.text(
        money(gross),
        R - 105,
        y + 16,
        {
          width: 93,
          align: 'right'
        }
      );

      doc.fillColor(gray)
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Progress invoice for work performed on ${p.name || 'this project'}.`,
          L + 12,
          y + 39,
          {
            width: 330,
            lineGap: 3
          }
        );

      doc.moveTo(L, y + 76)
        .lineTo(R, y + 76)
        .strokeColor(rule)
        .stroke();

      // NOTES
      const sy = 445;

      doc.fillColor(gray)
        .font('Helvetica-Bold')
        .fontSize(8)
        .characterSpacing(1)
        .text('NOTES', L, sy);

      doc.characterSpacing(0);

      doc.fillColor('#4B5563')
        .font('Helvetica')
        .fontSize(9)
        .text(
          'Thank you for your business.\nIf you have any questions, please contact us.',
          L,
          sy + 19,
          {
            width: 260,
            lineGap: 4
          }
        );

      doc.fillColor('#4B5563')
        .font('Helvetica-Bold')
        .text('Payment terms:', L, sy + 78);

      doc.font('Helvetica')
        .text(
          `Due ${i.dueDate || 'upon receipt'}.`,
          128,
          sy + 78
        );

      // TOTALS
      const tx = 350;
      const tw = 202;

      doc.fillColor(dark)
        .font('Helvetica')
        .fontSize(10)
        .text('Subtotal', tx, sy, {
          width: 95
        });

      doc.font('Helvetica-Bold')
        .text(money(gross), tx + 95, sy, {
          width: 107,
          align: 'right'
        });

      let ty = sy + 25;

      if (Number(i.retainage || 0)) {
        doc.font('Helvetica')
          .text('Retainage', tx, ty, {
            width: 95
          });

        doc.font('Helvetica-Bold')
          .text(
            `- ${money(i.retainage)}`,
            tx + 95,
            ty,
            {
              width: 107,
              align: 'right'
            }
          );

        ty += 22;
      }

      if (paid) {
        doc.font('Helvetica')
          .text('Paid', tx, ty, {
            width: 95
          });

        doc.font('Helvetica-Bold')
          .text(
            `- ${money(paid)}`,
            tx + 95,
            ty,
            {
              width: 107,
              align: 'right'
            }
          );

        ty += 22;
      }

      doc.moveTo(tx, ty - 5)
        .lineTo(tx + tw, ty - 5)
        .strokeColor(rule)
        .stroke();

      doc.rect(tx, ty + 5, tw, 48).fill(gold);

      doc.fillColor('#111111')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(
          'AMOUNT DUE',
          tx + 12,
          ty + 21,
          { width: 105 }
        );

      doc.text(
        money(balance),
        tx + 108,
        ty + 21,
        {
          width: 82,
          align: 'right'
        }
      );

      // MASTER TEMPLATE FOOTER
      // Fixed to page 1 — no second blank page.
      const fy = 650;
      const fh = 142;

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
            0,
            fy,
            {
              fit: [W, fh],
              align: 'center',
              valign: 'center'
            }
          );

          doc.restore();
        } catch {}
      }

      doc.rect(0, fy, W, fh)
        .fillOpacity(0.82)
        .fill('#0A0D12')
        .fillOpacity(1);

      doc.fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(12)
        .characterSpacing(2)
        .text(
          'BUILDING A STRONGER TOMORROW',
          L,
          fy + 47,
          {
            width: R - L,
            align: 'center'
          }
        );

      doc.characterSpacing(0);

      doc.fillColor(gold)
        .fontSize(7)
        .characterSpacing(0.8)
        .text(
          '● SAFETY          ◆ QUALITY          ■ INTEGRITY          ■ RESULTS',
          L,
          fy + 94,
          {
            width: R - L,
            align: 'center'
          }
        );

      doc.characterSpacing(0);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
};
