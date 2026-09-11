import type { IncomingMessage, ServerResponse } from 'node:http'
import { authenticate, hasRole, type AuthenticatedIdentity, type TokenVerifier } from './auth.js'
import { buildCategoryTree, type CategoryNode } from './categories.js'
import { findOrCreateUser, getPublicProvider, getPublicProviders, getProviderProfile, saveProviderProfile, setProviderServices, updateUserAccount, type PreferredLocale, type ProviderProfile, type ProviderProfileInput, type UserAccount } from './db.js'
import { type ApplicationRole } from './roles.js'

export interface AccountStore {
  findOrCreateUser(identity: AuthenticatedIdentity): Promise<UserAccount>
  updateUserAccount(id: string, changes: { displayName?: string | null; preferredLocale?: PreferredLocale }): Promise<UserAccount>
}

export interface ProviderStore {
  getProviderProfile(userId: string): Promise<ProviderProfile | null>
  saveProviderProfile(userId: string, input: ProviderProfileInput): Promise<ProviderProfile>
  setProviderServices(userId: string, categoryIds: string[]): Promise<ProviderProfile>
  getPublicProvider(userId: string): Promise<ProviderProfile | null>
  getPublicProviders(): Promise<ProviderProfile[]>
}

export interface ApiDependencies {
  verifier: TokenVerifier
  accounts?: AccountStore
  providers?: ProviderStore
  getCategories?: (filter?: string) => Promise<Awaited<ReturnType<typeof import('./db.js').getCategories>>>
}

const defaultAccounts: AccountStore = { findOrCreateUser, updateUserAccount }
const defaultProviders: ProviderStore = { getProviderProfile, saveProviderProfile, setProviderServices, getPublicProvider, getPublicProviders }
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

function publicProviderResponse(profile: ProviderProfile) {
  return {
    userId: profile.userId, displayName: profile.displayName, description: profile.description,
    profileImageRef: profile.profileImageRef, city: profile.city, postalCode: profile.postalCode,
    serviceRadiusKm: profile.serviceRadiusKm, availabilityStatus: profile.availabilityStatus,
    yearsExperience: profile.yearsExperience, startingPrice: profile.startingPrice, currency: profile.currency,
    services: profile.services, rating: null, contactAvailable: Boolean(profile.phone || profile.contactEmail),
  }
}

function providerProfileResponse(profile: ProviderProfile) {
  return { ...profile, contactEmail: profile.contactEmail, services: profile.services }
}

async function requireProvider(request: IncomingMessage, response: ServerResponse, dependencies: ApiDependencies) {
  const authenticated = await requireAccount(request, response, dependencies)
  if (!authenticated) return null
  if (!hasRole(authenticated.identity, 'PROVIDER')) {
    sendJson(response, 403, { error: 'Provider role required' })
    return null
  }
  return authenticated
}

function providerInput(body: Record<string, unknown>): ProviderProfileInput | null {
  const requiredStrings = ['displayName', 'description', 'city', 'postalCode']
  if (requiredStrings.some((key) => typeof body[key] !== 'string')) return null
  if (typeof body.serviceRadiusKm !== 'number' || !Number.isFinite(body.serviceRadiusKm) || body.serviceRadiusKm < 0 || body.serviceRadiusKm > 1000) return null
  if (!Number.isInteger(body.yearsExperience) || Number(body.yearsExperience) < 0 || Number(body.yearsExperience) > 100) return null
  const availability = body.availabilityStatus
  const visibility = body.visibility
  if (!['AVAILABLE', 'BUSY', 'UNAVAILABLE'].includes(String(availability)) || !['PUBLIC', 'PRIVATE'].includes(String(visibility))) return null
  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) return null
  if (body.startingPrice !== undefined && body.startingPrice !== null && (typeof body.startingPrice !== 'number' || body.startingPrice < 0)) return null
  const optional = (key: string) => body[key] === undefined || body[key] === null ? null : typeof body[key] === 'string' ? body[key].trim() : undefined
  const profileImageRef = optional('profileImageRef')
  const phone = optional('phone')
  const contactEmail = optional('contactEmail')
  if (profileImageRef === undefined || phone === undefined || contactEmail === undefined) return null
  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) return null
  const input = {
    displayName: String(body.displayName).trim(), description: String(body.description).trim(), profileImageRef, phone, contactEmail,
    city: String(body.city).trim(), postalCode: String(body.postalCode).trim(), serviceRadiusKm: body.serviceRadiusKm,
    availabilityStatus: availability as ProviderProfileInput['availabilityStatus'], yearsExperience: Number(body.yearsExperience),
    startingPrice: body.startingPrice === undefined || body.startingPrice === null ? null : Number(body.startingPrice),
    currency: body.currency, visibility: visibility as ProviderProfileInput['visibility'],
  }
  if (!input.displayName || !input.city || !input.postalCode || input.description.length > 4000) return null
  return input
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

      const providers = dependencies.providers ?? defaultProviders
      if ((request.method === 'GET' || request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') && url.pathname === '/api/v1/provider/profile') {
        const authenticated = await requireProvider(request, response, dependencies)
        if (!authenticated) return
        if (request.method === 'GET') {
          const profile = await providers.getProviderProfile(authenticated.account.id)
          sendJson(response, 200, { data: profile ? providerProfileResponse(profile) : null })
          return
        }
        const input = providerInput(await readBody(request))
        if (!input) { sendJson(response, 400, { error: 'Invalid provider profile' }); return }
        sendJson(response, 200, { data: providerProfileResponse(await providers.saveProviderProfile(authenticated.account.id, input)) })
        return
      }
      if ((request.method === 'PUT' || request.method === 'PATCH') && url.pathname === '/api/v1/provider/services') {
        const authenticated = await requireProvider(request, response, dependencies)
        if (!authenticated) return
        const body = await readBody(request)
        const categoryIds = body.categoryIds
        if (!Array.isArray(categoryIds) || categoryIds.length > 30 || categoryIds.some((id) => typeof id !== 'string') || new Set(categoryIds).size !== categoryIds.length) {
          sendJson(response, 400, { error: 'Invalid provider service categories' }); return
        }
        try { sendJson(response, 200, { data: providerProfileResponse(await providers.setProviderServices(authenticated.account.id, categoryIds as string[])) }) }
        catch (error) { if (error instanceof Error && error.message === 'Invalid provider service category') sendJson(response, 400, { error: error.message }); else throw error }
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/providers/homepage') {
        sendJson(response, 200, { data: (await providers.getPublicProviders()).map(publicProviderResponse) })
        return
      }
      const publicProviderPrefix = '/api/v1/providers/'
      if (request.method === 'GET' && url.pathname.startsWith(publicProviderPrefix)) {
        const userId = url.pathname.slice(publicProviderPrefix.length)
        if (!/^[0-9a-f-]{36}$/.test(userId)) { sendJson(response, 400, { error: 'Invalid provider id' }); return }
        const profile = await providers.getPublicProvider(userId)
        sendJson(response, profile ? 200 : 404, profile ? { data: publicProviderResponse(profile) } : { error: 'Provider not found' })
        return
      }

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