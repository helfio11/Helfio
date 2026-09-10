import type { IncomingMessage, ServerResponse } from 'node:http'
import { authenticate, hasRole, type AuthenticatedIdentity, type TokenVerifier } from './auth.js'
import { buildCategoryTree, type CategoryNode } from './categories.js'
import { findOrCreateUser, updateUserAccount, type PreferredLocale, type UserAccount } from './db.js'
import { type ApplicationRole } from './roles.js'

export interface AccountStore {
  findOrCreateUser(identity: AuthenticatedIdentity): Promise<UserAccount>
  updateUserAccount(id: string, changes: { displayName?: string | null; preferredLocale?: PreferredLocale }): Promise<UserAccount>
}

export interface ApiDependencies {
  verifier: TokenVerifier
  accounts?: AccountStore
  getCategories?: (filter?: string) => Promise<Awaited<ReturnType<typeof import('./db.js').getCategories>>>
}

const defaultAccounts: AccountStore = { findOrCreateUser, updateUserAccount }
const locales = new Set<PreferredLocale>(['en', 'de', 'sq', 'tr'])

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

async function readBody(request: IncomingMessage) {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 32_000) throw new Error('Request body too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    throw new Error('Invalid JSON')
  }
}

function accountResponse(account: UserAccount, identity: AuthenticatedIdentity) {
  return {
    id: account.id,
    keycloakSubjectId: account.keycloakSubjectId,
    email: account.email,
    displayName: account.displayName,
    preferredLocale: account.preferredLocale,
    accountStatus: account.accountStatus,
    roles: identity.roles,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

async function requireAccount(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  const identity = await authenticate(request, dependencies.verifier)
  if (!identity) {
    sendJson(response, 401, { error: 'Authentication required' })
    return null
  }
  const account = await (dependencies.accounts ?? defaultAccounts).findOrCreateUser(identity)
  if (account.accountStatus !== 'ACTIVE') {
    sendJson(response, 403, { error: 'Account is not active' })
    return null
  }
  return { identity, account }
}

async function roleRoute(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies, role: ApplicationRole) {
  const authenticated = await requireAccount(request, response, dependencies)
  if (!authenticated) return
  if (!hasRole(authenticated.identity, role)) {
    sendJson(response, 403, { error: 'Insufficient role' })
    return
  }
  sendJson(response, 200, { data: { allowed: true, role } })
}

export function createApiHandler(dependencies: ApiDependencies) {
  return async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    try {
      if (url.pathname === '/api/v1/me' && request.method === 'GET') {
        const authenticated = await requireAccount(request, response, dependencies)
        if (authenticated) sendJson(response, 200, { data: accountResponse(authenticated.account, authenticated.identity) })
        return
      }
      if (url.pathname === '/api/v1/me' && request.method === 'PATCH') {
        const authenticated = await requireAccount(request, response, dependencies)
        if (!authenticated) return
        const body = await readBody(request)
        const keys = Object.keys(body)
        if (keys.some((key) => !['displayName', 'preferredLocale'].includes(key))) {
          sendJson(response, 400, { error: 'Only displayName and preferredLocale can be changed' })
          return
        }
        if (body.displayName !== undefined && body.displayName !== null && (typeof body.displayName !== 'string' || body.displayName.trim().length > 100)) {
          sendJson(response, 400, { error: 'Invalid displayName' })
          return
        }
        if (body.preferredLocale !== undefined && (typeof body.preferredLocale !== 'string' || !locales.has(body.preferredLocale as PreferredLocale))) {
          sendJson(response, 400, { error: 'Invalid preferredLocale' })
          return
        }
        const account = await (dependencies.accounts ?? defaultAccounts).updateUserAccount(authenticated.account.id, {
          displayName: body.displayName === undefined ? undefined : body.displayName === null ? null : body.displayName.trim(),
          preferredLocale: body.preferredLocale as PreferredLocale | undefined,
        })
        sendJson(response, 200, { data: accountResponse(account, authenticated.identity) })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/authz/customer') return roleRoute(request, response, dependencies, 'CUSTOMER')
      if (request.method === 'GET' && url.pathname === '/api/v1/authz/provider') return roleRoute(request, response, dependencies, 'PROVIDER')
      if (request.method === 'GET' && url.pathname === '/api/v1/authz/admin') return roleRoute(request, response, dependencies, 'ADMIN')

      const getCategories = dependencies.getCategories
      if (getCategories && request.method === 'GET' && url.pathname.startsWith('/api/v1/categories')) {
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
          const category = flatten(buildCategoryTree(await getCategories("WHERE c.status = 'active'"))).find((item) => item.slug === slug)
          sendJson(response, category ? 200 : 404, category ? { data: category } : { error: 'Category not found' })
          return
        }
      }
      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      sendJson(response, message === 'Invalid JSON' || message === 'Request body too large' ? 400 : 500, { error: message === 'Invalid JSON' || message === 'Request body too large' ? message : 'Internal server error' })
    }
  }
}