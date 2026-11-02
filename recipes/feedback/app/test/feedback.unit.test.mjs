import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFeedback, newFeedback, newestFirst, asTask, MAX_FEEDBACK } from '../src/feedback.js';
import { feedbackData } from '../src/feedback-data.js';

test('feedback text is trimmed and capped', () => {
  assert.equal(cleanFeedback('  hi \n'), 'hi');
  assert.equal(cleanFeedback(null), '');
  assert.equal(cleanFeedback('x'.repeat(MAX_FEEDBACK + 9)).length, MAX_FEEDBACK);
});
test('a new message has exactly the fields the rules allow, and is not done', () => {
  const f = newFeedback('f1', 'Nice', { uid: 'u1', email: 'me@example.test' }, 5);
  assert.deepEqual(f, { id: 'f1', text: 'Nice', uid: 'u1', by: 'me@example.test', at: 5, done: false });
  assert.equal(newFeedback('f1', 'a', { uid: 'u1' }, 5).by, '');
  assert.equal(newFeedback('f1', 'a', { uid: 'u1', email: 'e'.repeat(300) }, 5).by.length, 200);
});
test('newestFirst sorts a copy', () => {
  const a = [{ id: 'a', text: '', at: 1, done: false }, { id: 'b', text: '', at: 3, done: false }];
  assert.deepEqual(newestFirst(a).map(f => f.id), ['b', 'a']);
  assert.equal(a[0].id, 'a');
});
test('a task line is one line', () => {
  assert.equal(asTask({ text: 'a\n b', by: 'me@x.test', at: Date.UTC(2026, 9, 27) }), '- [ ] a b (feedback from me@x.test, 2026-10-27)');
  assert.equal(asTask({ text: 'a', at: NaN }), '- [ ] a (feedback, undated)');
});
test('the data module writes the document under a fresh id, and refuses an empty or signed-out send', async () => {
  const sets = [];
  const F = { doc: (_db, c, i) => `${c}/${i}`, setDoc: async (ref, data) => sets.push([ref, data]) };
  const api = feedbackData.api({ sdk: async () => ({ F, db: {} }), id: () => 'n1', user: () => ({ uid: 'u1', email: 'a@b.test' }) });
  await api.send('  hello ');
  assert.deepEqual(sets[0][0], 'feedback/n1');
  assert.equal(sets[0][1].text, 'hello');
  await assert.rejects(api.send('   '), /Write something/);
  const out = feedbackData.api({ sdk: async () => ({ F, db: {} }), id: () => 'n2', user: () => null });
  await assert.rejects(out.send('hi'), /Sign in/);
  assert.equal(sets.length, 1);
});
