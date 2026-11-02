// The feedback module's rules cases, loaded by app/test/rules.test.mjs.

export const collections = [];

export function tests({ test, assert, emu, as }) {
  test('feedback: members write their own message; only admins read, mark done, delete', async () => {
    await emu.clear();
    const msg = (uid, extra = {}) => ({ id: 'f1', text: 'Nice', uid, by: 'me@example.test', at: 5, done: false, ...extra });
    assert.equal((await as('member').set('feedback/f1', msg('u-member'))).ok, true, 'member sends');
    assert.equal((await as('viewer').set('feedback/f2', msg('u-viewer', { id: 'f2' }))).ok, false, 'a viewer cannot');
    assert.equal((await as('member').set('feedback/f3', msg('u-member', { id: 'f3', uid: 'u-other' }))).ok, false, 'under someone else’s uid');
    assert.equal((await as('member').set('feedback/f4', msg('u-member', { id: 'f4', text: '' }))).ok, false, 'empty');
    assert.equal((await as('member').set('feedback/f5', msg('u-member', { id: 'f5', text: 'x'.repeat(2001) }))).ok, false, 'too long');
    assert.equal((await as('member').set('feedback/f6', msg('u-member', { id: 'f6', done: true }))).ok, false, 'born done');
    assert.equal((await as('member').set('feedback/f7', msg('u-member', { id: 'f7', extra: 1 }))).ok, false, 'a field not listed');
    assert.equal((await as('member').get('feedback/f1')).ok, false, 'members do not read');
    assert.equal((await as('admin').get('feedback/f1')).ok, true);
    assert.equal((await as('admin').update('feedback/f1', msg('u-member', { done: true }))).ok, true, 'mark done (the kit writes the whole document; the app’s updateDoc sends only done)');
    assert.equal((await as('admin').update('feedback/f1', msg('u-member', { text: 'changed' }))).ok, false, 'text stays');
    assert.equal((await as('member').update('feedback/f1', msg('u-member', { done: true }))).ok, false);
    assert.equal((await as('admin').delete('feedback/f1')).ok, true);
  });
}
