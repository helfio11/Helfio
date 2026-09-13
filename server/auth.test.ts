import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { Job, JobInput, JobStatus, PreferredLocale, ProviderProfile, ProviderProfileInput, UserAccount } from './db.js'

const identity: AuthenticatedIdentity = { subject: 'kc-user-1', email: 'user@example.com', displayName: 'Test User', roles: ['CUSTOMER'] }
const baseAccount: UserAccount = { id: 'user-1', keycloakSubjectId: identity.subject, email: identity.email, displayName: identity.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01' }

class FakeVerifier implements TokenVerifier {
  async verify(token: string): Promise<AuthenticatedIdentity> {
    if (token === 'valid') return identity
    if (token === 'provider') return providerIdentity
    if (token === 'other') return otherCustomerIdentity
    if (token === 'admin') return { ...identity, roles: ['ADMIN'] }
    throw new Error('invalid token')
  }
}

const providerIdentity: AuthenticatedIdentity = { subject: 'kc-provider-1', email: 'provider@example.com', displayName: 'Provider User', roles: ['PROVIDER'] }
const otherCustomerIdentity: AuthenticatedIdentity = { subject: 'kc-customer-2', email: 'other@example.com', displayName: 'Other Customer', roles: ['CUSTOMER'] }
const providerAccount: UserAccount = { ...baseAccount, id: '11111111-1111-4111-8111-111111111111', keycloakSubjectId: providerIdentity.subject }
const providerProfile: ProviderProfile = {
  userId: providerAccount.id, displayName: 'Provider Pro', description: 'Professional service provider', profileImageRef: 'profile.jpg',
  phone: '+491234', contactEmail: 'provider@example.com', city: 'Ravensburg', postalCode: '88212', serviceRadiusKm: 20,
  availabilityStatus: 'AVAILABLE', yearsExperience: 8, startingPrice: 35, currency: 'EUR', visibility: 'PUBLIC', verificationStatus: 'UNVERIFIED',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', services: [{ id: 'category-1', slug: 'cleaning', icon: 'C', translations: { en: { name: 'Cleaning', description: null }, de: { name: 'Reinigung', description: null }, sq: { name: 'Pastrim', description: null }, tr: { name: 'Temizlik', description: null } } }],
}
const jobCategory = { id: 'category-1', parentId: null, slug: 'cleaning', status: 'active' as const, icon: 'C', sortOrder: 1, showInNavigation: true, showOnHomepage: true, createdAt: '2026-01-01', updatedAt: '2026-01-01', translations: { en: { name: 'Cleaning', description: 'Home cleaning' }, de: { name: 'Reinigung', description: 'Haushaltsreinigung' }, sq: { name: 'Pastrim', description: 'Pastrim shtepie' }, tr: { name: 'Temizlik', description: 'Ev temizligi' } } }
const jobBase: Job = { id: '33333333-3333-4333-8333-333333333333', customerUserId: baseAccount.id, assignedProviderUserId: null, categoryId: jobCategory.id, title: 'Clean my flat', description: 'Two rooms and a kitchen.', city: 'Ravensburg', postalCode: '88212', countryCode: 'DE', budgetType: 'RANGE', budgetMin: 50, budgetMax: 100, currency: 'EUR', preferredDate: null, preferredTimeText: null, status: 'DRAFT', createdAt: '2026-01-01', updatedAt: '2026-01-01', assignedAt: null, startedAt: null, finishedAt: null, completedAt: null, cancelledAt: null, category: jobCategory }

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

class FakeJobs {
  jobs = new Map([[jobBase.id, { ...jobBase }]])
  async getJobs(customerUserId: string) { return [...this.jobs.values()].filter((job) => job.customerUserId === customerUserId) }
  async getJob(id: string) { return this.jobs.get(id) ?? null }
  async createJob(customerUserId: string, input: JobInput) {
    if (input.categoryId !== jobCategory.id) throw new Error('Invalid active category')
    const job = { ...jobBase, ...input, id: '44444444-4444-4444-8444-444444444444', customerUserId, status: 'DRAFT' as const }
    this.jobs.set(job.id, job)
    return job
  }
  async updateJob(id: string, customerUserId: string, changes: Partial<JobInput>) {
    const job = this.jobs.get(id)
    if (!job || job.customerUserId !== customerUserId) throw new Error('Job not found')
    const updated = { ...job, ...changes, updatedAt: '2026-01-02' }
    this.jobs.set(id, updated)
    return updated
  }
  async transitionJob(id: string, customerUserId: string, from: JobStatus, to: JobStatus) {
    const job = this.jobs.get(id)
    if (!job || job.customerUserId !== customerUserId || job.status !== from) throw new Error('Invalid job transition')
    const updated = { ...job, status: to, cancelledAt: to === 'CANCELLED' ? '2026-01-03' : job.cancelledAt }
    this.jobs.set(id, updated)
    return updated
  }
  async getAssignedJobs(providerUserId: string) { return [...this.jobs.values()].filter((job) => job.assignedProviderUserId === providerUserId) }
  async startJob(id: string, providerUserId: string) { const job = this.jobs.get(id); if (!job || job.assignedProviderUserId !== providerUserId || job.status !== 'ASSIGNED') throw new Error('Invalid job transition'); const updated = { ...job, status: 'IN_PROGRESS' as const, startedAt: '2026-01-04' }; this.jobs.set(id, updated); return updated }
  async finishJob(id: string, providerUserId: string) { const job = this.jobs.get(id); if (!job || job.assignedProviderUserId !== providerUserId || job.status !== 'IN_PROGRESS') throw new Error('Invalid job transition'); const updated = { ...job, status: 'AWAITING_CONFIRMATION' as const, finishedAt: '2026-01-05' }; this.jobs.set(id, updated); return updated }
  async confirmJob(id: string, customerUserId: string) { const job = this.jobs.get(id); if (!job || job.customerUserId !== customerUserId || job.status !== 'AWAITING_CONFIRMATION') throw new Error('Invalid job transition'); const updated = { ...job, status: 'COMPLETED' as const, completedAt: '2026-01-06' }; this.jobs.set(id, updated); return updated }
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
    if (currentIdentity.subject === otherCustomerIdentity.subject) return { ...this.account, id: '22222222-2222-4222-8222-222222222222', keycloakSubjectId: currentIdentity.subject, email: currentIdentity.email, displayName: currentIdentity.displayName }
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

async function withServer(accounts: FakeAccounts, callback: (baseUrl: string) => Promise<void>, providers?: FakeProviders, jobs?: FakeJobs) {
  const server: Server = createServer(createApiHandler({ verifier: new FakeVerifier(), accounts, providers, jobs }))
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

test('customer jobs enforce roles, ownership, validation, translations, and lifecycle', async () => {
  const accounts = new FakeAccounts()
  const jobs = new FakeJobs()
  await withServer(accounts, async (baseUrl) => {
    const customerHeaders = { authorization: 'Bearer valid', 'content-type': 'application/json' }
    const providerHeaders = { authorization: 'Bearer provider', 'content-type': 'application/json' }
    const payload = { categoryId: 'category-1', title: 'Clean my flat', description: 'Two rooms and a kitchen.', city: 'Ravensburg', postalCode: '88212', countryCode: 'DE', budgetType: 'RANGE', budgetMin: 50, budgetMax: 100, currency: 'EUR' }
    assert.equal((await request(baseUrl, '/api/v1/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })).status, 401)
    assert.equal((await request(baseUrl, '/api/v1/jobs', { method: 'POST', headers: providerHeaders, body: JSON.stringify(payload) })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/jobs', { method: 'POST', headers: customerHeaders, body: JSON.stringify({ ...payload, categoryId: 'missing' }) })).status, 400)
    assert.equal((await request(baseUrl, '/api/v1/jobs', { method: 'POST', headers: customerHeaders, body: JSON.stringify({ ...payload, budgetMin: 101 }) })).status, 400)
    const created = await request(baseUrl, '/api/v1/jobs', { method: 'POST', headers: customerHeaders, body: JSON.stringify(payload) })
    assert.equal(created.status, 201)
    const createdBody = await created.json() as { data: Job }
    assert.equal(createdBody.data.status, 'DRAFT')
    assert.deepEqual(Object.keys(createdBody.data.category.translations).sort(), ['de', 'en', 'sq', 'tr'])
    const id = createdBody.data.id
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}`, { method: 'PATCH', headers: { ...customerHeaders, authorization: 'Bearer other' }, body: JSON.stringify({ title: 'No access' }) })).status, 403)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}`, { method: 'PATCH', headers: customerHeaders, body: JSON.stringify({ title: 'Updated request' }) })).status, 200)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/publish`, { method: 'POST', headers: customerHeaders })).status, 200)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/publish`, { method: 'POST', headers: customerHeaders })).status, 400)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}`, { method: 'PATCH', headers: customerHeaders, body: JSON.stringify({ title: 'Updated open request' }) })).status, 200)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/cancel`, { method: 'POST', headers: customerHeaders })).status, 200)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}`, { method: 'PATCH', headers: customerHeaders, body: JSON.stringify({ title: 'Cannot edit' }) })).status, 400)

    const assigned = jobs.jobs.get(id)
    assert.ok(assigned)
    jobs.jobs.set(id, { ...assigned, status: 'ASSIGNED', assignedProviderUserId: '99999999-9999-4999-8999-999999999999', assignedAt: '2026-01-03' })
    assert.equal((await request(baseUrl, '/api/v1/provider/jobs/assigned', { headers: providerHeaders })).status, 200)
    assert.equal((await request(baseUrl, `/api/v1/provider/jobs/${id}/start`, { method: 'POST', headers: providerHeaders })).status, 403)
    jobs.jobs.set(id, { ...jobs.jobs.get(id)!, assignedProviderUserId: providerAccount.id })
    assert.equal((await request(baseUrl, `/api/v1/provider/jobs/${id}/start`, { method: 'POST', headers: providerHeaders })).status, 200)
    const started = jobs.jobs.get(id)
    assert.equal(started?.startedAt, '2026-01-04')
    assert.equal((await request(baseUrl, `/api/v1/provider/jobs/${id}/complete`, { method: 'POST', headers: providerHeaders })).status, 404)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/confirm`, { method: 'POST', headers: customerHeaders })).status, 409)
    assert.equal((await request(baseUrl, `/api/v1/provider/jobs/${id}/finish`, { method: 'POST', headers: providerHeaders })).status, 200)
    assert.equal(jobs.jobs.get(id)?.finishedAt, '2026-01-05')
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/confirm`, { method: 'POST', headers: { ...customerHeaders, authorization: 'Bearer other' } })).status, 403)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/confirm`, { method: 'POST', headers: customerHeaders })).status, 200)
    assert.equal(jobs.jobs.get(id)?.completedAt, '2026-01-06')
    assert.equal((await request(baseUrl, `/api/v1/provider/jobs/${id}/finish`, { method: 'POST', headers: providerHeaders })).status, 409)
    assert.equal((await request(baseUrl, `/api/v1/jobs/${id}/cancel`, { method: 'POST', headers: customerHeaders })).status, 409)
  }, undefined, jobs)
})
