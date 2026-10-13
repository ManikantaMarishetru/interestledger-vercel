/**
 * Minimal dependency-free PDF writer (PDF 1.4, Helvetica only).
 * Enough for a clean, print-friendly A4 invoice — no paid APIs, no CDN.
 */
import { formatINR } from "./money.js";

function pdfEscape(s) {
  // Helvetica (WinAnsi) has no ₹ glyph, so render rupees as "Rs." instead of
  // emitting raw UTF-8 bytes that viewers show as garbage.
  return String(s).replace(/₹/g, "Rs.").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildInvoicePdfBytes(invoice, business) {
  const L = [];
  const push = (text, x, y, size = 11, bold = false) => {
    L.push({ text: String(text), x, y, size, bold });
  };
  let y = 800;
  push(business.name || "SmartBill", 40, y, 18, true); y -= 18;
  if (business.address) { push(business.address, 40, y, 10); y -= 14; }
  const contact = [business.phone, business.email, business.gstin ? `GSTIN: ${business.gstin}` : ""].filter(Boolean).join("  |  ");
  if (contact) { push(contact, 40, y, 10); y -= 14; }
  push(`${invoice.mode === "gst" ? "GST " : ""}INVOICE  ${invoice.number}   Date: ${invoice.date}`, 40, y, 12, true); y -= 20;
  push(`Customer: ${invoice.customerName || "Walk-in"}${invoice.customerPhone ? "  (" + invoice.customerPhone + ")" : ""}`, 40, y, 11); y -= 16;
  push(`Payment: ${invoice.paymentMethod}  |  Status: ${invoice.status}  |  Paid: ${formatINR(invoice.paidPaise)}  |  Due: ${formatINR(invoice.balancePaise)}`, 40, y, 10); y -= 20;

  push("Item  Qty  Price  Disc  Tax  Total", 40, y, 10, true); y -= 14;
  for (const it of invoice.itemsSnapshot) {
    const line = `${it.name.slice(0, 28)}  ${it.qty}  ${formatINR(it.unitPricePaise)}  ${formatINR(it.itemDiscount + (it.billDiscountShare || 0))}  ${it.taxRate}%  ${formatINR(it.taxable + it.tax)}`;
    push(line, 40, y, 10); y -= 13;
    if (y < 150) break; // single-page Phase 1 (items beyond one page are truncated visibly)
  }
  y -= 8;
  const t = invoice.totals;
  const rows = [
    ["Subtotal:", formatINR(t.subtotalGross)],
    ["Item discounts:", "-" + formatINR(t.itemDiscountTotal)],
    ["Bill discount:", "-" + formatINR(t.billDiscountPaise)],
    ["Taxable value:", formatINR(t.taxableValue)],
  ];
  if (invoice.mode === "gst") {
    if (invoice.gstType === "interstate") rows.push(["IGST:", formatINR(t.igstTotal)]);
    else { rows.push(["CGST:", formatINR(t.cgstTotal)]); rows.push(["SGST:", formatINR(t.sgstTotal)]); }
  } else rows.push(["Tax (non-GST):", formatINR(t.taxTotal)]);
  rows.push(["Rounding:", formatINR(t.roundoff)]);
  rows.push(["GRAND TOTAL:", formatINR(t.grandTotal)]);
  for (const [k, v] of rows) { push(`${k} ${v}`, 40, y, 11, k === "GRAND TOTAL:"); y -= 15; }

  let content = "BT /F1 11 Tf\n";
  for (const l of L) {
    content += `1 0 0 1 ${l.x} ${l.y} Tm (${pdfEscape(l.text)}) Tj\n`;
  }
  content += "ET";
  // NOTE: bold flag is visual intent only in Phase 1 (Helvetica has no embedded bold); sizes carry hierarchy.

  const enc = new TextEncoder();
  const contentBytes = enc.encode(content);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(enc.encode(pdf).length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = enc.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return enc.encode(pdf);
}

export function downloadPdf(filename, bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return blob; // returned so callers can also use navigator.share with the file
}
