/* Ranking check: one Skydo payment (USD 650 from "Acme Holdings Inc") against a
   representative spread of Refrens invoices, including two deliberate decoys --
   the same client already settled, and the same amount in another currency. */
const fs = require('fs'), vm = require('vm');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/match.js', 'utf8'), ctx);

const inv = (number, clientName, total, due, status, invoiceDate, currency = 'USD') =>
  ({ id: number, number, clientName, total, due, status, invoiceDate, currency });

const invoices = [
  inv('INV-0165', 'Acme Holdings', 650, 650, 'UNPAID', '2026-08-24'),
  inv('INV-0161', 'Contoso Financials, Inc.', 7000, 0, 'PAID', '2026-07-26'),
  inv('INV-0160', 'Globex Media', 1300, 0, 'PAID', '2026-07-26'),
  inv('INV-0149', 'Initech Studio', 2500, 0, 'PAID', '2026-06-15'),
  inv('INV-0129', 'Umbrella Design, Inc', 750, 0, 'PAID', '2026-04-22'),
  inv('INV-0125', 'Soylent Media LLC', 1500, 0, 'PAID', '2026-04-10'),
  inv('INV-0062', 'Northwind Ltd', 800, 800, 'UNPAID', '2025-09-09'),
  inv('INV-0099', 'Acme Holdings', 650, 0, 'PAID', '2026-01-11'),   // decoy: right client+amount, already settled
  inv('9999-INR', 'Acme Holdings', 650, 650, 'UNPAID', '2026-08-24', 'INR') // decoy: wrong currency
];

const payment = { amount: 650, currency: 'USD', payerName: 'Acme Holdings Inc', creditedAt: '2026-09-02T03:36:00Z' };
const ranked = ctx.rankMatches(invoices, payment);

console.log('rank  score  invoice       client');
ranked.forEach((m, i) =>
  console.log(String(i + 1).padEnd(6), String(m.score).padEnd(6), m.invoice.number.padEnd(13), m.invoice.clientName));

const top = ranked[0];
console.log('\nwhy #1:');
top.reasons.forEach(r => console.log(`  ${r.ok ? '+' : '-'} ${r.label}: ${r.detail}`));

const fails = [];
if (top.invoice.number !== 'INV-0165') fails.push(`expected INV-0165 first, got ${top.invoice.number}`);
if (ranked.some(m => m.invoice.currency !== 'USD')) fails.push('an INR invoice leaked past the currency filter');
if (top.score < 90) fails.push(`exact match scored only ${top.score}`);
const settled = ranked.find(m => m.invoice.number === 'INV-0099');
if (settled && settled.score >= top.score) fails.push('settled decoy ranked at or above the real match');

console.log(fails.length ? '\nFAIL\n' + fails.join('\n') : '\nPASS');
process.exit(fails.length ? 1 : 0);
