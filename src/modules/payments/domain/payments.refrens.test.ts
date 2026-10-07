import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bankReference, draftRefrensPayment, outstandingOn } from './payments.refrens';

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
