import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { Job, SearchInput, SearchResults } from './db.js'

const identity: AuthenticatedIdentity = { subject: 'search-user', email: 'search@example.com', displayName: 'Search User', roles: ['CUSTOMER'] }
const account = { id: 'search-account', keycloakSubjectId: identity.subject, email: identity.email, displayName: identity.displayName, preferredLocale: 'en' as const, accountStatus: 'ACTIVE' as const, createdAt: '', updatedAt: '' }
class Verifier implements TokenVerifier { async verify(token: string) { if (token === 'valid') return identity; throw new Error('invalid') } }

async function withServer(search: (input: SearchInput) => Promise<SearchResults>, callback: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(createApiHandler({ verifier: new Verifier(), accounts: { findOrCreateUser: async () => account, updateUserAccount: async () => account }, search }))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}

function results(): SearchResults {
  const job = { id: 'job-1', customerUserId: 'private-customer', title: 'Public open job', description: 'Public description', city: 'Ravensburg', currency: 'EUR', budgetMin: 20, budgetMax: 40, category: { slug: 'cleaning', translations: {} } } as unknown as Job
  return {
    providers: { items: [{ userId: 'provider-1', displayName: 'Public Provider', description: 'Public service', profileImageRef: null, city: 'Ravensburg', postalCode: '88212', serviceRadiusKm: 20, availabilityStatus: 'AVAILABLE', yearsExperience: 4, startingPrice: 25, currency: 'EUR', services: [] }], page: 1, pageSize: 12, total: 1, hasNext: false },
    jobs: { items: [job], page: 1, pageSize: 12, total: 1, hasNext: false },
    categories: { items: [], page: 1, pageSize: 12, total: 0, hasNext: false },
  }
}

test('search validates text, category, city, filters, sorting, and pagination', async () => {
  let received: SearchInput | null = null
  await withServer(async (input) => { received = input; return results() }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/search?q=cleaning&category=cleaning&city=Ravensburg&availability=AVAILABLE&minPrice=10&maxPrice=40&sort=newest&page=2&pageSize=5`)
    assert.equal(response.status, 200)
    assert.equal(received?.query, 'cleaning'); assert.equal(received?.category, 'cleaning'); assert.equal(received?.city, 'Ravensburg'); assert.equal(received?.availability, 'AVAILABLE'); assert.equal(received?.minPrice, 10); assert.equal(received?.maxPrice, 40); assert.equal(received?.sort, 'newest'); assert.equal(received?.page, 2); assert.equal(received?.pageSize, 5)
    assert.equal((await fetch(`${baseUrl}/api/v1/search?page=0`)).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/v1/search?minPrice=40&maxPrice=10`)).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/v1/search?category=not valid`)).status, 400)
  })
})

test('search result projections remain public-safe and preserve pagination metadata', async () => {
  await withServer(async () => results(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/search?kind=providers&pageSize=1`)
    assert.equal(response.status, 200)
    const provider = ((await response.json()) as { data: { providers: { items: Array<Record<string, unknown>>; pageSize: number } } }).data.providers
    assert.equal(provider.pageSize, 12)
    assert.equal(provider.items[0].contactEmail, undefined)
    assert.equal(provider.items[0].phone, undefined)
    assert.equal(provider.items[0].displayName, 'Public Provider')
    const jobs = ((await (await fetch(`${baseUrl}/api/v1/search?kind=jobs`)).json()) as { data: { jobs: { items: Array<Record<string, unknown>> } } }).data.jobs
    assert.equal(jobs.items[0].customerUserId, undefined)
  })
})
