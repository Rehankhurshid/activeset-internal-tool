import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountFit,
  matchPayment,
  namesMatch,
  parsePayer,
  payerKeyFromName,
  type MatchContext,
} from './payments.matching';
import type { PayerRule, PaymentInvoiceRef } from './payments.types';

// Narrations below are the shapes Axis Bank lines take in Fold (names changed
// where they would identify a real client).

describe('parsePayer', () => {
  it('prefers the merchant name and strips company-form words from the key', () => {
    const p = parsePayer({
      narration: 'NEFT/KKBKH261/ACME IVF PRIVATE LIMITED/KOTAK MAHINDRA BANK /Payment',
      merchantName: 'ACME IVF PRIVATE LIMITED',
    });
    assert.equal(p.payerKey, 'acme-ivf');
    assert.equal(p.payerName, 'ACME IVF PRIVATE LIMITED');
    assert.equal(p.channel, 'NEFT');
    assert.equal(p.via, null);
  });

  it('reads the payer out of the narration when Fold has no merchant', () => {
    const p = parsePayer({ narration: 'RTGS/HDFCR5202/NORTHWIND INC/HDFC BANK//NRE/NRE', merchantName: null });
    assert.equal(p.payerKey, 'northwind');
    assert.equal(p.channel, 'RTGS');
  });

  it('marks Skydo payouts as via Skydo, whatever the remitter field says', () => {
    const p = parsePayer({
      narration: 'IMPS/P2A/626416572066/SKYDOTEC/Remitter/PACBEnsu/9181233834807139000',
      merchantName: null,
    });
    assert.equal(p.via, 'skydo');
    assert.equal(p.payerKey, 'skydo');
    assert.equal(p.payerName, 'Skydo');
  });

  it('copes with truncated legal words', () => {
    assert.equal(payerKeyFromName('SPACEPORT TECHNOLOGIES PRIV'), 'spaceport-technologies');
    assert.equal(payerKeyFromName('ZETA TECHNOLOGY PRIVATE LIMIT'), 'zeta-technology');
    assert.equal(payerKeyFromName('DELTA ULTRA HIGH PURITY PRIVAT'), 'delta-ultra-high-purity');
  });
});

describe('namesMatch', () => {
  it('matches a truncated bank name to the client name', () => {
    assert.ok(namesMatch('ZETA TECHNOLOGY PRIVATE LIMIT', 'Zeta'));
    assert.ok(namesMatch('SPACEPORT TECHNOLOGIES PRIV', 'Spaceport Technologies Pvt Ltd'));
  });
  it('does not match on generic words alone', () => {
    assert.ok(!namesMatch('ALPHA TECHNOLOGIES', 'Beta Technologies'));
    assert.ok(!namesMatch('TECHNOLOGIES PRIVATE LIMITED', 'Technologies'));
  });
  it('does not match unrelated names', () => {
    assert.ok(!namesMatch('ORCHARD FOODS', 'Dream Team'));
  });
});

const inv = (over: Partial<PaymentInvoiceRef>): PaymentInvoiceRef => ({
  id: 'i1',
  projectId: 'p1',
  label: null,
  invoiceNumber: 'AS-101',
  amount: 100000,
  currency: 'INR',
  status: 'UNPAID',
  billedToName: null,
  ...over,
});

describe('amountFit', () => {
  it('is exact within a rupee', () => {
    assert.equal(amountFit(100000.5, inv({})), 'exact');
  });
  it('accepts 2% and 10% TDS on the pre-GST amount', () => {
    assert.equal(amountFit(100000 * (1 - 0.02 / 1.18), inv({})), 'after-tds');
    assert.equal(amountFit(100000 * (1 - 0.1 / 1.18), inv({})), 'after-tds');
  });
  it('ignores foreign-currency invoices and big gaps', () => {
    assert.equal(amountFit(100000, inv({ currency: 'USD' })), null);
    assert.equal(amountFit(50000, inv({})), null);
  });
});

const projects = [
  { id: 'p1', name: 'Zeta website', client: 'Zeta' },
  { id: 'p2', name: 'Acme rebuild', client: 'Acme IVF' },
  { id: 'p3', name: 'Northwind retainer', client: 'Northwind' },
];

function ctx(over: Partial<MatchContext> = {}): MatchContext {
  return { rules: new Map(), projects, invoices: [], ...over };
}

describe('matchPayment', () => {
  it('auto-assigns a remembered payer and picks the invoice the amount fits', () => {
    const rule: PayerRule = { payerKey: 'acme-ivf', payerName: 'ACME IVF', projectId: 'p2', createdBy: 'x', createdAt: '' };
    const r = matchPayment(
      { amount: 35640, payerKey: 'acme-ivf', payerName: 'ACME IVF PRIVATE LIMITED', via: null },
      ctx({ rules: new Map([['acme-ivf', rule]]), invoices: [inv({ id: 'i9', projectId: 'p2', amount: 35640 })] })
    );
    assert.deepEqual(r, { kind: 'auto', projectId: 'p2', invoiceId: 'i9', reason: 'Remembered payer' });
  });

  it('never applies a payer rule to Skydo', () => {
    const rule: PayerRule = { payerKey: 'skydo', payerName: 'Skydo', projectId: 'p1', createdBy: 'x', createdAt: '' };
    const r = matchPayment({ amount: 55345.1, payerKey: 'skydo', payerName: 'Skydo', via: 'skydo' }, ctx({ rules: new Map([['skydo', rule]]) }));
    assert.equal(r.kind, 'none');
  });

  it('suggests the project whose client name matches the payer', () => {
    const r = matchPayment({ amount: 177120, payerKey: 'zeta-technology', payerName: 'ZETA TECHNOLOGY PRIVATE LIMIT', via: null }, ctx());
    assert.equal(r.kind, 'suggest');
    if (r.kind === 'suggest') {
      assert.equal(r.suggestion.projectId, 'p1');
      assert.equal(r.suggestion.confidence, 'medium');
    }
  });

  it('suggests from the invoice bill-to name too, and raises confidence when the amount fits', () => {
    const r = matchPayment(
      { amount: 98305, payerKey: 'orchard-foods', payerName: 'ORCHARD FOODS LIMITED', via: null },
      ctx({ invoices: [inv({ id: 'i3', projectId: 'p3', amount: 100000, billedToName: 'Orchard Foods Ltd' })] })
    );
    assert.equal(r.kind, 'suggest');
    if (r.kind === 'suggest') {
      assert.equal(r.suggestion.projectId, 'p3');
      assert.equal(r.suggestion.invoiceId, 'i3');
      assert.equal(r.suggestion.confidence, 'high');
      assert.match(r.suggestion.reason, /after TDS/);
    }
  });

  it('falls back to a unique exact amount', () => {
    const r = matchPayment(
      { amount: 148680, payerKey: 'unknown-co', payerName: 'UNKNOWN', via: null },
      ctx({ invoices: [inv({ id: 'a', projectId: 'p1', amount: 148680 }), inv({ id: 'b', projectId: 'p2', amount: 150000 })] })
    );
    assert.equal(r.kind, 'suggest');
    if (r.kind === 'suggest') assert.equal(r.suggestion.invoiceId, 'a');
  });

  it('suggests nothing when two invoices fit equally', () => {
    const r = matchPayment(
      { amount: 50000, payerKey: 'x', payerName: 'X', via: null },
      ctx({ invoices: [inv({ id: 'a', projectId: 'p1', amount: 50000 }), inv({ id: 'b', projectId: 'p2', amount: 50000 })] })
    );
    assert.equal(r.kind, 'none');
  });

  it('skips paid invoices and rules pointing at deleted projects', () => {
    const rule: PayerRule = { payerKey: 'gone', payerName: 'GONE', projectId: 'deleted', createdBy: 'x', createdAt: '' };
    const r = matchPayment(
      { amount: 1000, payerKey: 'gone', payerName: 'GONE', via: null },
      ctx({ rules: new Map([['gone', rule]]), invoices: [inv({ amount: 1000, status: 'PAID' })] })
    );
    assert.equal(r.kind, 'none');
  });
});
