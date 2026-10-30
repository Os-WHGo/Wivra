import test from 'node:test';
import assert from 'node:assert/strict';

test('a single saved take is eligible, but multiple segments are ambiguous', () => {
  const added = (oldItems, newItems) => newItems.filter(x => !oldItems.includes(x));
  assert.deepEqual(added(['prior'], ['new', 'prior']), ['new']);
  assert.equal(added(['prior'], ['first', 'second', 'prior']).length, 2);
});
