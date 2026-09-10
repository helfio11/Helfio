import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCategoryTree, type CategoryRow } from './categories.js'

const category = (id: string, parentId: string | null, sortOrder: number): CategoryRow => ({
  id, parentId, slug: id, status: 'active', icon: null, sortOrder,
  showInNavigation: true, showOnHomepage: true, createdAt: '', updatedAt: '', translations: {},
})

test('buildCategoryTree nests and sorts categories', () => {
  const tree = buildCategoryTree([
    category('child', 'root', 2), category('root', null, 2), category('first', null, 1), category('sibling', 'root', 1),
  ])
  assert.deepEqual(tree.map((item) => item.id), ['first', 'root'])
  assert.deepEqual(tree[1].children.map((item) => item.id), ['sibling', 'child'])
})