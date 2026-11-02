// A search hit's passage (made-up text): the first searched word, marked, with about two lines around it; and the terms
// a passage may mark (no leave-outs, operators or another field's words).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSearch, snippetOf, plainLines } from '../public/search/index.js';

const w = (/** @type {string} */ text) => ({ text, phrase: false });

test('the first searched word, from where a word starts, with text either side; Markdown read as plain text', () => {
  const s = snippetOf('# Trip\nPack the **blue** bag. Then call the garage about the tyres before Friday.', [w('gar')], { markdown: true });
  assert.deepEqual(s, { before: '…Pack the blue bag. Then call the ', match: 'garage', after: ' about the tyres before Friday.' });
  assert.deepEqual(plainLines('- [x] done [link](https://x.test)\n\n> quote'), ['done link', 'quote']);
  // plain text keeps its marks; new lines are spaces
  assert.equal(snippetOf('a **b**\nc', [w('c')])?.before, 'a **b** ');
});

test('a long text: a few words before the match, an ellipsis at each cut', () => {
  const s = snippetOf('alpha '.repeat(40) + 'needle ' + 'omega '.repeat(40), [w('needle')]);
  assert.ok(s);
  assert.equal(s.match, 'needle');
  assert.ok(s.before.startsWith('…') && s.after.endsWith('…'));
  assert.ok(s.before.length < 50 && (s.before + s.match + s.after).length < 130);
});

test('the earliest of several words; a phrase anywhere; case does not matter', () => {
  assert.equal(snippetOf('one Two three', [w('three'), w('two')])?.match, 'Two');
  assert.equal(snippetOf('a bluebird sang', [{ text: 'bird sa', phrase: true }])?.match, 'bird sa');
});

test('a word only inside another word, or not there at all: no passage', () => {
  assert.equal(snippetOf('a bluebird sang', [w('bird')]), null);
  assert.equal(snippetOf('nothing here', [w('zebra')]), null);
  assert.equal(snippetOf('anything', []), null);
});

test('characters that mean something in a pattern are just text', () => {
  assert.equal(snippetOf('cost is 3+4 (approx)', [{ text: '3+4 (', phrase: true }])?.match, '3+4 (');
});

test('terms: words and phrases to mark, never a leave-out, an operator or another field’s', () => {
  const s = createSearch({ fields: ['title', 'body'], operators: { is: () => true } });
  assert.deepEqual(s.terms('Gar "the blue" -tyres is:long title:trip body:friday OR monday', 'body'),
    [w('gar'), { text: 'the blue', phrase: true }, w('friday'), w('monday')]);
  assert.deepEqual(s.terms('title:trip'), []);
});
