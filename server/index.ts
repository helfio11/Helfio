import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { buildCategoryTree, type CategoryNode } from './categories.js'
import { closeDatabase, getCategories } from './db.js'

const port = Number(process.env.PORT ?? 3001)

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (request.method !== 'GET' || !url.pathname.startsWith('/api/v1/categories')) {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  try {
    if (url.pathname === '/api/v1/categories' || url.pathname === '/api/v1/categories/tree') {
      sendJson(response, 200, { data: buildCategoryTree(await getCategories("WHERE c.status = 'active'")) })
      return
    }
    if (url.pathname === '/api/v1/categories/homepage') {
      const rows = await getCategories("WHERE c.status = 'active' AND c.show_on_homepage = true AND c.parent_id IS NULL")
      sendJson(response, 200, { data: buildCategoryTree(rows) })
      return
    }
    if (url.pathname === '/api/v1/categories/navigation') {
      const rows = await getCategories("WHERE c.status = 'active' AND c.show_in_navigation = true")
      sendJson(response, 200, { data: buildCategoryTree(rows) })
      return
    }

    const prefix = '/api/v1/categories/'
    if (url.pathname.startsWith(prefix)) {
      const slug = url.pathname.slice(prefix.length)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        sendJson(response, 400, { error: 'Invalid category slug' })
        return
      }
      const rows = await getCategories("WHERE c.status = 'active'")
      const category = flatten(buildCategoryTree(rows)).find((item) => item.slug === slug)
      if (!category) {
        sendJson(response, 404, { error: 'Category not found' })
        return
      }
      sendJson(response, 200, { data: category })
      return
    }
  } catch (error) {
    console.error(error)
    sendJson(response, 500, { error: 'Internal server error' })
  }
}

const server = createServer((request, response) => void handle(request, response))
server.listen(port, () => console.log(`Helfio category API listening on http://localhost:${port}`))

process.on('SIGTERM', async () => {
  server.close()
  await closeDatabase()
})