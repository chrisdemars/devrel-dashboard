import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, num } from '../src/lib/csv.js';
import { runSource, STATUS } from '../src/lib/source.js';

test('parseCsv handles quotes, commas and blank lines', () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi"""\n\n1,2\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"' }, { a: '1', b: '2' }]);
});

test('num tolerates currency and blanks', () => {
  assert.equal(num('$1,200'), 1200);
  assert.equal(num(''), 0);
  assert.equal(num('n/a'), 0);
});

test('runSource reports each status', async () => {
  delete process.env.TEST_VAR;
  const base = { id: 't', name: 't', category: 'x' };

  const placeholder = await runSource({ ...base, placeholder: 'later' });
  assert.equal(placeholder.status, STATUS.PLACEHOLDER);

  const missing = await runSource({ ...base, env: [{ name: 'TEST_VAR', required: true, help: 'h' }], collect: async () => ({}) });
  assert.equal(missing.status, STATUS.NOT_CONFIGURED);
  assert.deepEqual(missing.missing, ['TEST_VAR']);

  const anyOf = await runSource({ ...base, requireAny: ['TEST_VAR'], collect: async () => ({}) });
  assert.equal(anyOf.status, STATUS.NOT_CONFIGURED);

  const failed = await runSource({ ...base, collect: async () => { throw new Error('boom'); } });
  assert.equal(failed.status, STATUS.ERROR);
  assert.equal(failed.error, 'boom');

  const ok = await runSource({ ...base, collect: async () => ({ metrics: { n: 1 } }) });
  assert.equal(ok.status, STATUS.OK);
  assert.deepEqual(ok.metrics, { n: 1 });
});
