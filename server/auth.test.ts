import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { PreferredLocale, ProviderProfile, ProviderProfileInput, UserAccount } from './db.js'

const identity: AuthenticatedIdentity = { subject: 'kc-user-1', email: 'user@example.com', displayName: 'Test User', roles: ['CUSTOMER'] }
const baseAccount: UserAccount = { id: 'user-1', keycloakSubjectId: identity.subject, email: identity.email, displayName: identity.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01' }

class FakeVerifier implements TokenVerifier {
  async verify(token: string): Promise<AuthenticatedIdentity> {
    if (token === 'valid') return identity
    if (token === 'provider') return providerIdentity
    if (token === 'admin') return { ...identity, roles: ['ADMIN'] }
    throw new Error('invalid token')
  }
}

const providerIdentity: AuthenticatedIdentity = { subject: 'kc-provider-1', email: 'provider@example.com', displayName: 'Provider User', roles: ['PROVIDER'] }
const providerAccount: UserAccount = { ...baseAccount, id: '11111111-1111-4111-8111-111111111111', keycloakSubjectId: providerIdentity.subject }
const providerProfile: ProviderProfile = {
  userId: providerAccount.id, displayName: 'Provider Pro', description: 'Professional service provider', profileImageRef: 'profile.jpg',
  phone: '+491234', contactEmail: 'provider@example.com', city: 'Ravensburg', postalCode: '88212', serviceRadiusKm: 20,
  availabilityStatus: 'AVAILABLE', yearsExperience: 8, startingPrice: 35, currency: 'EUR', visibility: 'PUBLIC', verificationStatus: 'UNVERIFIED',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', services: [{ id: 'category-1', slug: 'cleaning', icon: 'C', translations: { en: { name: 'Cleaning', description: null }, de: { name: 'Reinigung', description: null }, sq: { name: 'Pastrim', description: null }, tr: { name: 'Temizlik', description: null } } }],
}

class FakeProviders {
  profile: ProviderProfile | null = null
  saved = 0
  services: string[] = []
  async getProviderProfile(userId: string) { return this.profile?.userId === userId ? this.profile : null }
  async saveProviderProfile(userId: string, input: ProviderProfileInput) { this.saved += 1; this.profile = { ...providerProfile, ...input, userId }; return this.profile }
  async setProviderServices(userId: string, categoryIds: string[]) { if (categoryIds.includes('invalid')) throw new Error('Invalid provider service category'); this.services = categoryIds; this.profile = { ...(this.profile ?? providerProfile), userId, services: categoryIds.map((id) => ({ id, slug: id, icon: null, translations: {} })) }; return this.profile }
  async getPublicProvider(userId: string) { return this.profile?.userId === userId && this.profile.visibility === 'PUBLIC' ? this.profile : null }
  async getPublicProviders() { return this.profile?.visibility === 'PUBLIC' ? [this.profile] : [] }
}

class FakeAccounts implements AccountStore {
  account = { ...baseAccount }
  calls = 0
  creates = 0
  updates = 0
  async findOrCreateUser(currentIdentity: AuthenticatedIdentity) {
    this.calls += 1
    if (this.calls === 1) this.creates += 1
    if (currentIdentity.subject === providerIdentity.subject) return providerAccount
    this.account = { ...this.account, keycloakSubjectId: currentIdentity.subject, email: currentIdentity.email, displayName: currentIdentity.displayName }
    return this.account
  }
  async updateUserAccount(id: string, changes: { displayName?: string | null; preferredLocale?: PreferredLocale }) {
    assert.equal(id, this.account.id)
    this.updates += 1
    this.account = { ...this.account, displayName: changes.displayName === undefined ? this.account.displayName : changes.displayName, preferredLocale: changes.preferredLocale ?? this.account.preferredLocale }
    return this.account
  }
}

async function withServer(accounts: FakeAccounts, callback: (baseUrl: string) => Promise<void>, providers?: FakeProviders) {
  const server: Server = createServer(createApiHandler({ verifier: new FakeVerifier(), accounts, providers }))
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test server address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}

async function request(baseUrl: string, path: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, init)
}

test('unauthenticated and invalid tokens return 401', async () => {
  await withServer(new FakeAccounts(), async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/v1/me')).status, 401)
    assert.equal((await request(baseUrl, '/api/v1/me', { headers: { authorization: 'Bearer invalid' } })).status, 401)
  })
})

test('valid /me synchronizes one local account and repeated calls reuse it', async () => {
  const accounts = new FakeAccounts()
  await withServer(accounts, async (baseUrl) => {
    const headers = { authorization: 'Bearer valid' }
    const first = await request(baseUrl, '/api/v1/me', { headers })
    const second = await request(baseUrl, '/api/v1/me', { headers })
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(accounts.calls, 2)
    assert.equal(accounts.creates, 1)
    const payload = await first.json() as { data: { keycloakSubjectId: string; roles: string[] } }
    assert.equal(payload.data.keycloakSubjectId, identity.subject)
    assert.deepEqual(payload.data.roles, ['CUSTOMER'])
  })
})

test('authorization returns 403 for insufficient roles and 200 for allowed roles', async () => {
  await withServer(new FakeAccounts(), async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/v1/authz/provider', { headers: { authorization: 'Bearer valid' } })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/authz/provider', { headers: { authorization: 'Bearer provider' } })).status, 200)
  })
})

test('suspended accounts are rejected even with a valid token', async () => {
  const accounts = new FakeAccounts()
  accounts.account.accountStatus = 'SUSPENDED'
  await withServer(accounts, async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/v1/me', { headers: { authorization: 'Bearer valid' } })).status, 403)
  })
})

test('PATCH /me allows profile fields, locales, and rejects escalation or invalid locales', async () => {
  const accounts = new FakeAccounts()
  await withServer(accounts, async (baseUrl) => {
    const headers = { authorization: 'Bearer valid', 'content-type': 'application/json' }
    const valid = await request(baseUrl, '/api/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ displayName: ' Updated ', preferredLocale: 'tr' }) })
    assert.equal(valid.status, 200)
    assert.equal(accounts.account.displayName, 'Updated')
    assert.equal(accounts.account.preferredLocale, 'tr')
    assert.equal((await request(baseUrl, '/api/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ roles: ['ADMIN'] }) })).status, 400)
    assert.equal((await request(baseUrl, '/api/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ preferredLocale: 'fr' }) })).status, 400)
    assert.equal((await request(baseUrl, '/api/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ preferredLocale: 'de' }) })).status, 200)
    assert.equal((await request(baseUrl, '/api/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ preferredLocale: 'sq' }) })).status, 200)
  })
})

test('provider profile requires PROVIDER and supports profile plus dynamic services', async () => {
  const accounts = new FakeAccounts()
  const providers = new FakeProviders()
  await withServer(accounts, async (baseUrl) => {
    const customerHeaders = { authorization: 'Bearer valid', 'content-type': 'application/json' }
    const providerHeaders = { authorization: 'Bearer provider', 'content-type': 'application/json' }
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { headers: customerHeaders })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { headers: providerHeaders })).status, 200)
    const profile = { displayName: 'Provider Pro', description: 'Professional service provider', city: 'Ravensburg', postalCode: '88212', serviceRadiusKm: 20, availabilityStatus: 'AVAILABLE', yearsExperience: 8, startingPrice: 35, currency: 'EUR', visibility: 'PUBLIC' }
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { method: 'PUT', headers: providerHeaders, body: JSON.stringify(profile) })).status, 200)
    assert.equal((await request(baseUrl, '/api/v1/provider/services', { method: 'PUT', headers: providerHeaders, body: JSON.stringify({ categoryIds: ['category-1'] }) })).status, 200)
    assert.deepEqual(providers.services, ['category-1'])
    assert.equal((await request(baseUrl, '/api/v1/provider/services', { method: 'PUT', headers: providerHeaders, body: JSON.stringify({ categoryIds: ['invalid'] }) })).status, 400)
    assert.equal(providers.saved, 1)
  }, providers)
})

test('provider ownership and public profile fields are enforced', async () => {
  const accounts = new FakeAccounts()
  const providers = new FakeProviders()
  providers.profile = providerProfile
  await withServer(accounts, async (baseUrl) => {
    const publicResponse = await request(baseUrl, `/api/v1/providers/${providerAccount.id}`)
    assert.equal(publicResponse.status, 200)
    const publicBody = await publicResponse.json() as { data: Record<string, unknown> }
    assert.equal(publicBody.data.phone, undefined)
    assert.equal(publicBody.data.contactEmail, undefined)
    assert.equal(publicBody.data.rating, null)
    const services = publicBody.data.services as Array<{ translations: Record<string, { name: string }> }>
    assert.deepEqual(Object.keys(services[0].translations).sort(), ['de', 'en', 'sq', 'tr'])
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { headers: { authorization: 'Bearer valid' } })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { headers: { authorization: 'Bearer invalid' } })).status, 401)
    providers.profile = { ...providerProfile, userId: '22222222-2222-4222-8222-222222222222' }
    const ownRead = await request(baseUrl, '/api/v1/provider/profile', { headers: { authorization: 'Bearer provider' } })
    assert.deepEqual((await ownRead.json() as { data: unknown }).data, null)
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { headers: { authorization: 'Bearer provider' } })).status, 200)
    assert.equal((await request(baseUrl, '/api/v1/provider/profile', { method: 'PUT', headers: { authorization: 'Bearer provider', 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Other', description: '', city: 'City', postalCode: '00000', serviceRadiusKm: 1, availabilityStatus: 'AVAILABLE', yearsExperience: 0, currency: 'EUR', visibility: 'PRIVATE' }) })).status, 200)
    assert.equal(providers.profile?.userId, providerAccount.id)
  }, providers)
})
