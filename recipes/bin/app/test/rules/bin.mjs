// The bin module's rules case, loaded by app/test/rules.test.mjs: writers remove an entry (restore, purge); viewers cannot.

export function tests({ test, assert, emu, as }) {
  test('bin: a writer removes an entry (restore, purge for good); a viewer only reads', async () => {
    await emu.clear();
    const entry = { id: 'a', kind: 'tasks', data: { id: 'a', text: 'ok' }, deletedAt: 2, updatedAt: 2 };
    assert.equal((await as('member').set('spaces/_/bin/tasks:a', entry, { serverAt: true })).ok, true);
    assert.equal((await as('viewer').delete('spaces/_/bin/tasks:a')).ok, false, 'viewers cannot purge');
    assert.equal((await as('viewer').get('spaces/_/bin/tasks:a')).ok, true);
    assert.equal((await as('member').delete('spaces/_/bin/tasks:a')).ok, true);
    assert.equal((await as('member').set('spaces/_/bin/tasks:b', entry, { serverAt: true })).ok, true);
    assert.equal((await as('admin').delete('spaces/_/bin/tasks:b')).ok, true);
    assert.equal((await emu.as('u-new', {}).delete('spaces/_/bin/tasks:a')).ok, false, 'no role, no access');
  });
}
