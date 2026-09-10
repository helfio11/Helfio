export type CategoryStatus = 'active' | 'inactive'

export interface CategoryRow {
  id: string
  parentId: string | null
  slug: string
  status: CategoryStatus
  icon: string | null
  sortOrder: number
  showInNavigation: boolean
  showOnHomepage: boolean
  createdAt: string
  updatedAt: string
  translations: Record<string, { name: string; description: string | null }>
}

export interface CategoryNode extends CategoryRow {
  children: CategoryNode[]
}

export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>()
  const roots: CategoryNode[] = []

  for (const row of rows) nodes.set(row.id, { ...row, children: [] })
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sort = (items: CategoryNode[]) => {
    items.sort((left, right) => left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug))
    items.forEach((item) => sort(item.children))
  }
  sort(roots)
  return roots
}