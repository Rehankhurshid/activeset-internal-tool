import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_RULES_MAX, CLIENT_RULE_MAX_LENGTH, groupRules, normalizeClientRules, portalRules } from './client-rules';

describe('normalizeClientRules', () => {
  it('trims, drops empty rules and unknown kinds, and keeps ids unique', () => {
    const rules = normalizeClientRules([
      { id: 'r1', text: '  No   ARN details\n', category: 'compliance' },
      { id: 'r1', text: 'Purple only in the products section', category: 'colour' },
      { id: 'r3', text: '   ' },
      null,
      'not a rule',
    ]);
    assert.equal(rules.length, 2);
    assert.deepEqual(rules[0], { id: 'r1', text: 'No ARN details', category: 'compliance' });
    assert.equal(rules[1].text, 'Purple only in the products section');
    assert.equal(rules[1].category, undefined);
    assert.notEqual(rules[1].id, 'r1');
  });

  it('caps the length of a rule and the number of rules', () => {
    const long = normalizeClientRules([{ id: 'a', text: 'x'.repeat(1000) }]);
    assert.equal(long[0].text.length, CLIENT_RULE_MAX_LENGTH);
    const many = normalizeClientRules(Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, text: `Rule ${i}` })));
    assert.equal(many.length, CLIENT_RULES_MAX);
  });

  it('is empty for anything that is not a list', () => {
    assert.deepEqual(normalizeClientRules(undefined), []);
    assert.deepEqual(normalizeClientRules({ rules: [] }), []);
  });
});

describe('portalRules and groupRules', () => {
  it('sends text and kind only, grouped compliance, brand, copy, then the rest', () => {
    const rules = portalRules([
      { id: 'a', text: 'Write in plain English', category: 'copy', updatedBy: 'x@activeset.co' },
      { id: 'b', text: 'No calculations' },
      { id: 'c', text: 'Masked brokerage', category: 'compliance' },
    ]);
    assert.deepEqual(rules[0], { id: 'a', text: 'Write in plain English', category: 'copy' });
    assert.deepEqual(
      groupRules(rules).map((g) => [g.category, g.rules.map((r) => r.id)]),
      [
        ['compliance', ['c']],
        ['copy', ['a']],
        [undefined, ['b']],
      ],
    );
  });
});
