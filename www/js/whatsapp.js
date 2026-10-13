/** WhatsApp click-to-chat helpers (no auto-send, no PDF attach via URL). */
import { formatINR } from "./money.js";

export function invoiceMessage(inv, invoiceUrlOrNull) {
  const lines = [
    `Hello ${inv.customerName || "Customer"},`,
    `Invoice ${inv.number} from ${inv.businessName || "our shop"}:`,
    `Total: ${formatINR(inv.totals.grandTotal)}`,
    `Discount: ${formatINR(inv.totals.itemDiscountTotal + inv.totals.billDiscountPaise)}`,
    `Paid: ${formatINR(inv.paidPaise)} | Due: ${formatINR(inv.balancePaise)} (${inv.status})`,
  ];
  if (invoiceUrlOrNull) lines.push(`View: ${invoiceUrlOrNull}`);
  else lines.push(`(Show this message at the shop for your PDF copy.)`);
  lines.push(`— Please pay the due amount at your convenience. Thank you!`);
  return lines.join("\n");
}

export function invoiceBillText(inv, business) {
  const b = business || {};
  const t = inv.totals || {};
  const lines = [];
  const shopName = b.name || inv.businessName || "SmartBill";
  lines.push(`*${shopName}*`);
  if (b.address) lines.push(String(b.address));
  const contact = [b.phone, b.gstin ? "GSTIN: " + b.gstin : ""].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  lines.push("--------------------------------");
  lines.push(`Bill No: ${inv.number || ""}`);
  let dateStr = inv.date;
  try {
    const d = new Date(inv.date);
    dateStr = isNaN(d) ? String(inv.date ?? "") : d.toLocaleString("en-IN");
  } catch { dateStr = String(inv.date ?? ""); }
  lines.push(`Date: ${dateStr}`);
  lines.push(`Customer: ${inv.customerName || "Walk-in"}${inv.customerPhone ? ` (${inv.customerPhone})` : ""}`);
  lines.push("--------------------------------");
  const items = inv.itemsSnapshot || [];
  items.forEach((it, i) => {
    const lineTotal = (it.taxable || 0) + (it.tax || 0);
    lines.push(`${i + 1}) ${it.name}`);
    lines.push(`   ${it.qty} x ${formatINR(it.unitPricePaise)} = ${formatINR(lineTotal)}`);
  });
  lines.push("--------------------------------");
  lines.push(`Subtotal: ${formatINR(t.subtotalGross || 0)}`);
  lines.push(`Item discounts: -${formatINR(t.itemDiscountTotal || 0)}`);
  lines.push(`Bill discount: -${formatINR(t.billDiscountPaise || 0)}`);
  lines.push(`Taxable value: ${formatINR(t.taxableValue || 0)}`);
  if (inv.mode === "gst") {
    if (inv.gstType === "interstate") {
      lines.push(`IGST: ${formatINR(t.igstTotal || 0)}`);
    } else {
      lines.push(`CGST: ${formatINR(t.cgstTotal || 0)}`);
      lines.push(`SGST: ${formatINR(t.sgstTotal || 0)}`);
    }
  } else {
    lines.push(`Tax: ${formatINR(t.taxTotal || 0)}`);
  }
  lines.push(`Rounding: ${formatINR(t.roundoff || 0)}`);
  lines.push(`*Grand Total: ${formatINR(t.grandTotal || 0)}*`);
  lines.push(`Paid (${inv.paymentMethod || "cash"}): ${formatINR(inv.paidPaise || 0)}`);
  lines.push(`*Due: ${formatINR(inv.balancePaise || 0)} (${inv.status})*`);
  lines.push("--------------------------------");
  lines.push("Thank you! Visit again.");
  return lines.join("\n");
}

export function reminderMessage(customerName, outstandingPaise) {
  return `Hello ${customerName}, this is a friendly reminder: your outstanding balance is ${formatINR(outstandingPaise)}. Please pay at your convenience. Thank you!`;
}

export function waLink(phoneOrNull, message) {
  let digits = phoneOrNull ? String(phoneOrNull).replace(/\D/g, "") : "";
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// Only use a link when it is a real reachable http(s) URL (never file://, never invented).
export function pageUrlIfShareable() {
  try {
    const u = new URL(window.location.href);
    if ((u.protocol === "http:" || u.protocol === "https:") && u.host) return u.href.split("#")[0];
    return null;
  } catch { return null; }
}
