import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bankReference, draftRefrensPayment, outstandingOn, rankRefrensInvoices, type RefrensOpenInvoice } from './payments.refrens';

const payment = (over: Partial<Parameters<typeof draftRefrensPayment>[0]['payment']> = {}) => ({
  id: 'fold-1',
  amount: 100000,
  currency: 'INR',
  narration: 'NEFT/KKBKH26273961150/ACME IVF PRIVATE LIMITED/KOTAK MAHINDRA BANK /Payment',
  channel: 'NEFT',
  payerName: 'ACME IVF PRIVATE LIMITED',
  via: null,
  ...over,
});

describe('bankReference', () => {
  it('reads the UTR from NEFT, RTGS and IMPS lines', () => {
    assert.equal(bankReference('NEFT/KKBKH26273961150/ACME/KOTAK'), 'KKBKH26273961150');
    assert.equal(bankReference('RTGS/HDFCR52026090755941966/ORCHARD/HDFC BANK'), 'HDFCR52026090755941966');
    assert.equal(bankReference('IMPS/P2A/626416572066/SKYDOTEC/Remitter'), '626416572066');
  });
  it('returns null for lines it does not know', () => {
    assert.equal(bankReference('BRN-REF NO.0106FIR2600493 EUR 1330/RLZ'), null);
  });
});

describe('outstandingOn', () => {
  it('subtracts amount, TDS and charges of earlier payments', () => {
    assert.equal(outstandingOn(118000, [{ amount: 50000, tds: 1000 }, { amount: 20000, transactionCharge: 50 }]), 46950);
  });
  it('never goes below zero', () => {
    assert.equal(outstandingOn(1000, [{ amount: 1200 }]), 0);
  });
});

describe('draftRefrensPayment', () => {
  it('records an exact payment as is', () => {
    const d = draftRefrensPayment({ payment: payment(), invoice: { currency: 'INR', outstanding: 100000, invoiceNumber: 'AS-1' } });
    assert.equal(d.amount, 100000);
    assert.equal(d.tds, 0);
    assert.equal(d.paymentMethod, 'ACCOUNT_TRANSFER');
    assert.equal(d.refId, 'KKBKH26273961150');
    assert.equal(d.warning, null);
  });

  it('reads a 10% TDS short payment as TDS', () => {
    const d = draftRefrensPayment({
      payment: payment({ amount: 108474.58 }),
      invoice: { currency: 'INR', outstanding: 118000, invoiceNumber: 'AS-2' },
    });
    assert.equal(d.amount, 108474.58);
    assert.equal(d.tds, 9525.42);
    assert.equal(d.warning, null);
  });

  it('treats a big shortfall as a part payment and says so', () => {
    const d = draftRefrensPayment({ payment: payment({ amount: 50000 }), invoice: { currency: 'INR', outstanding: 100000, invoiceNumber: null } });
    assert.equal(d.tds, 0);
    assert.match(d.warning ?? '', /part/);
  });

  it('prefills the amount due for a USD invoice paid in INR through Skydo, with a warning', () => {
    const d = draftRefrensPayment({
      payment: payment({ amount: 55345.1, via: 'Skydo', channel: 'IMPS', narration: 'IMPS/P2A/626416572066/SKYDOTEC/Remitter' }),
      invoice: { currency: 'USD', outstanding: 650, invoiceNumber: 'AS-3' },
    });
    assert.equal(d.amount, 650);
    assert.equal(d.refId, '626416572066');
    assert.match(d.warning ?? '', /USD/);
  });

  it('uses UPI as the method for UPI credits', () => {
    const d = draftRefrensPayment({
      payment: payment({ channel: 'UPI', narration: 'UPI/P2A/104088724230/SOMEONE/HDFC' }),
      invoice: { currency: 'INR', outstanding: 100000, invoiceNumber: null },
    });
    assert.equal(d.paymentMethod, 'UPI');
  });
});

describe('rankRefrensInvoices', () => {
  const open = (over: Partial<RefrensOpenInvoice>): RefrensOpenInvoice => ({
    refrensInvoiceId: 'r1',
    invoiceNumber: '2026-001',
    invoiceDate: '2026-09-01',
    currency: 'INR',
    total: 148680,
    due: 148680,
    dueInr: 148680,
    billedToName: 'Someone Else Pvt Ltd',
    ...over,
  });
  const project = { name: 'Hyprix', client: 'Spaceport Technologies' };

  it('puts the invoice billed to the client with the exact amount first', () => {
    const ranked = rankRefrensInvoices(
      { amount: 148680, currency: 'INR', payerName: 'SPACEPORT TECHNOLOGIES PRIV', via: null },
      project,
      [open({ refrensInvoiceId: 'other', due: 99000 }), open({ refrensInvoiceId: 'match', billedToName: 'Spaceport Technologies Private Limited' })]
    );
    assert.equal(ranked[0].refrensInvoiceId, 'match');
    assert.equal(ranked[0].score, 6);
    assert.deepEqual(ranked[0].reasons, ['Billed to this client', 'Exact amount']);
  });

  it('matches a Skydo INR payout to a USD invoice by its INR value, loosely', () => {
    const ranked = rankRefrensInvoices(
      { amount: 55345.1, currency: 'INR', payerName: 'Skydo', via: 'Skydo' },
      { name: 'Muffins', client: null },
      [open({ refrensInvoiceId: 'usd', currency: 'USD', total: 650, due: 650, dueInr: 56500, billedToName: 'Muffin Labs Inc' }), open({ refrensInvoiceId: 'inr', due: 30000 })]
    );
    assert.equal(ranked[0].refrensInvoiceId, 'usd');
    assert.deepEqual(ranked[0].reasons, ['Billed to this client', 'Close to the INR value']);
  });

  it('never name-matches Skydo as the payer', () => {
    const ranked = rankRefrensInvoices(
      { amount: 1, currency: 'INR', payerName: 'Skydo', via: 'Skydo' },
      { name: 'X', client: null },
      [open({ billedToName: 'Skydo Technologies' })]
    );
    assert.equal(ranked[0].score, 0);
  });

  it('matches a credit that paid an invoice already marked paid, with 10% TDS on the total', () => {
    const ranked = rankRefrensInvoices(
      { amount: 148680, currency: 'INR', payerName: 'SPACEPORT TECHNOLOGIES PRIV', via: null },
      { name: 'Hyprix', client: null },
      [open({ refrensInvoiceId: 'paid', due: 165200, total: 165200, alreadyPaid: true, billedToName: 'Spaceport Technologies Pvt Ltd' })]
    );
    assert.equal(ranked[0].score, 5);
    assert.deepEqual(ranked[0].reasons, ['Billed to the payer', 'Amount fits after TDS']);
  });

  it('does not amount-match a Skydo INR payout to an INR invoice', () => {
    const ranked = rankRefrensInvoices(
      { amount: 235298.45, currency: 'INR', payerName: 'Skydo', via: 'Skydo' },
      { name: 'Muffins', client: null },
      [open({ due: 247800 })]
    );
    assert.equal(ranked[0].score, 0);
  });
});
