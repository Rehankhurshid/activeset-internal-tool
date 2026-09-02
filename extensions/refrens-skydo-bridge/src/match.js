/* Scores Refrens invoices against one Skydo unmapped payment.
   Every rule contributes a labelled reason so the preview can show its work
   instead of an unexplained number. */

/* Company suffixes carry no signal: "Acme Holdings" and "Acme Holdings Inc" are one client. */
const NOISE = new Set([
  'inc', 'inc.', 'llc', 'ltd', 'limited', 'llp', 'plc', 'corp', 'corporation',
  'co', 'company', 'gmbh', 'bv', 'nv', 'pty', 'pte', 'sa', 'srl', 'ag', 'ab',
  'the', 'and', 'of'
]);

function nameTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));
}

/* Jaccard over meaningful tokens, with a bonus when one name contains the other. */
function nameScore(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const hits = A.filter((t) => setB.has(t)).length;
  const jaccard = hits / new Set([...A, ...B]).size;
  const joinedA = A.join(' '), joinedB = B.join(' ');
  const containment = joinedA.includes(joinedB) || joinedB.includes(joinedA) ? 0.35 : 0;
  return Math.min(1, jaccard + containment);
}

function daysBetween(a, b) {
  const ta = Date.parse(a), tb = Date.parse(b);
  if (!ta || !tb) return null;
  return Math.abs(ta - tb) / 86_400_000;
}

/* payment: { amount, currency, payerName, creditedAt } */
function scoreInvoice(inv, payment) {
  const reasons = [];
  let score = 0;

  if (inv.currency !== payment.currency) return null; // hard filter, never mix currencies

  // --- amount -------------------------------------------------------------
  const amt = payment.amount;
  const outstanding = inv.due > 0 ? inv.due : inv.total;
  const diff = Math.abs(outstanding - amt);
  const pct = outstanding ? diff / outstanding : 1;

  if (diff < 0.005) {
    score += 55; reasons.push({ ok: true, label: 'Amount', detail: `exact match on ${fmt(outstanding, inv.currency)}` });
  } else if (pct <= 0.02) {
    score += 42; reasons.push({ ok: true, label: 'Amount', detail: `within 2% — ${fmt(diff, inv.currency)} short, consistent with bank charges` });
  } else if (pct <= 0.1) {
    score += 24; reasons.push({ ok: true, label: 'Amount', detail: `within 10% — ${fmt(diff, inv.currency)} difference` });
  } else if (amt < outstanding) {
    score += 12; reasons.push({ ok: true, label: 'Amount', detail: `part payment — ${fmt(amt, inv.currency)} of ${fmt(outstanding, inv.currency)}` });
  } else {
    score -= 15; reasons.push({ ok: false, label: 'Amount', detail: `payment exceeds invoice by ${fmt(amt - outstanding, inv.currency)}` });
  }

  // --- payer name ---------------------------------------------------------
  const ns = nameScore(payment.payerName, inv.clientName);
  if (ns >= 0.6) {
    score += 30; reasons.push({ ok: true, label: 'Client', detail: `"${inv.clientName}" matches payer "${payment.payerName}"` });
  } else if (ns >= 0.3) {
    score += 16; reasons.push({ ok: true, label: 'Client', detail: `"${inv.clientName}" partly matches payer "${payment.payerName}"` });
  } else {
    reasons.push({ ok: false, label: 'Client', detail: `"${inv.clientName}" does not match payer "${payment.payerName}"` });
  }

  // --- still owed ---------------------------------------------------------
  if (inv.due > 0) {
    score += 12; reasons.push({ ok: true, label: 'Status', detail: `${inv.status} — ${fmt(inv.due, inv.currency)} outstanding` });
  } else {
    score -= 8; reasons.push({ ok: false, label: 'Status', detail: `${inv.status} — already settled in Refrens` });
  }

  // --- timing -------------------------------------------------------------
  const age = daysBetween(inv.invoiceDate, payment.creditedAt);
  if (age !== null) {
    if (age <= 45) { score += 10; reasons.push({ ok: true, label: 'Date', detail: `raised ${Math.round(age)} day(s) before the payment landed` }); }
    else if (age <= 120) { score += 4; reasons.push({ ok: true, label: 'Date', detail: `raised ${Math.round(age)} days before the payment` }); }
    else { reasons.push({ ok: false, label: 'Date', detail: `raised ${Math.round(age)} days from the payment date` }); }
  }

  if (/CANCEL|DRAFT|VOID/i.test(inv.status)) {
    score -= 40; reasons.push({ ok: false, label: 'Status', detail: `${inv.status} invoices should not be submitted` });
  }

  return { invoice: inv, score: Math.min(100, Math.max(0, Math.round(score))), reasons };
}

function fmt(n, cur) {
  return `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rankMatches(invoices, payment, limit = 6) {
  return invoices
    .map((i) => scoreInvoice(i, payment))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
