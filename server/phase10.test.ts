import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore, type JobStore, type ProviderStore, type ReviewStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { Job, RatingSummary, Review, ReviewInput, UserAccount } from './db.js'

const customerIdentity: AuthenticatedIdentity = { subject: 'phase10-customer', email: 'customer@example.com', displayName: 'Customer', roles: ['CUSTOMER'] }
const otherIdentity: AuthenticatedIdentity = { subject: 'phase10-other', email: 'other@example.com', displayName: 'Other Customer', roles: ['CUSTOMER'] }
const customer: UserAccount = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', keycloakSubjectId: customerIdentity.subject, email: customerIdentity.email, displayName: 'Customer', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }
const otherCustomer: UserAccount = { ...customer, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', keycloakSubjectId: otherIdentity.subject, email: otherIdentity.email, displayName: 'Other Customer' }
const providerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const jobId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const providerProfile = { userId: providerId, displayName: 'Provider', description: 'Public', profileImageRef: null, phone: '+49123', contactEmail: 'private@example.com', city: 'Ravensburg', postalCode: '88212', serviceRadiusKm: 10, availabilityStatus: 'AVAILABLE' as const, yearsExperience: 4, startingPrice: 20, currency: 'EUR', visibility: 'PUBLIC' as const, verificationStatus: 'UNVERIFIED' as const, createdAt: '', updatedAt: '', services: [], rating: { averageRating: null, reviewCount: 0 } }
const completedJob = { id: jobId, customerUserId: customer.id, assignedProviderUserId: providerId, status: 'COMPLETED' as const } as unknown as Job
const review: Review = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', jobId, providerUserId: providerId, rating: 5, comment: 'Excellent', reviewerDisplayName: 'Customer', createdAt: '', updatedAt: '' }

class Verifier implements TokenVerifier { async verify(token: string) { if (token === 'customer') return customerIdentity; if (token === 'other') return otherIdentity; throw new Error('invalid') } }
class Accounts implements AccountStore { async findOrCreateUser(identity: AuthenticatedIdentity) { return identity.subject === otherIdentity.subject ? otherCustomer : customer } async updateUserAccount() { return customer } }
class Providers implements ProviderStore { async getProviderProfile() { return providerProfile } async saveProviderProfile() { return providerProfile } async setProviderServices() { return providerProfile } async getPublicProvider() { return providerProfile } async getPublicProviders() { return [providerProfile] } }
class Jobs implements JobStore { async getJobs() { return [] } async getAssignedJobs() { return [] } async getJob() { return completedJob } async createJob() { return completedJob } async updateJob() { return completedJob } async transitionJob() { return completedJob } async startJob() { return completedJob } async finishJob() { return completedJob } async confirmJob() { return completedJob } }
class Reviews implements ReviewStore { created = 0; async createReview(customerUserId: string, requestedJobId: string, input: ReviewInput) { assert.equal(customerUserId, customer.id); assert.equal(requestedJobId, jobId); this.created += 1; return { ...review, rating: input.rating, comment: input.comment } } async getProviderReviews() { return [review] } async getProviderRating(): Promise<RatingSummary> { return { averageRating: 5, reviewCount: 1 } } }

async function withServer(reviews: ReviewStore, callback: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(createApiHandler({ verifier: new Verifier(), accounts: new Accounts(), providers: new Providers(), jobs: new Jobs(), reviews }))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}
function headers(token: string) { return { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }

test('completed customer can review and public review data is private-safe', async () => {
  const reviews = new Reviews()
  await withServer(reviews, async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/review`, { method: 'POST', headers: headers('customer'), body: JSON.stringify({ rating: 5, comment: 'Excellent' }) })
    assert.equal(created.status, 201)
    const payload = await created.json() as { data: Record<string, unknown> }
    assert.equal(payload.data.reviewerDisplayName, 'Customer')
    assert.equal(payload.data.customerUserId, undefined)
    assert.equal(payload.data.providerUserId, undefined)
    assert.equal(payload.data.comment, 'Excellent')
    const listed = await fetch(`${baseUrl}/api/v1/providers/${providerId}/reviews`)
    assert.equal(listed.status, 200)
    const rating = await fetch(`${baseUrl}/api/v1/providers/${providerId}/rating`)
    assert.deepEqual((await rating.json() as { data: RatingSummary }).data, { averageRating: 5, reviewCount: 1 })
  })
  assert.equal(reviews.created, 1)
})

test('review creation requires the authenticated customer and validates rating', async () => {
  const reviews = new Reviews()
  await withServer(reviews, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/jobs/${jobId}/review`, { method: 'POST', headers: headers('other'), body: JSON.stringify({ rating: 5 }) })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/v1/jobs/${jobId}/review`, { method: 'POST', headers: headers('customer'), body: JSON.stringify({ rating: 0 }) })).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/v1/jobs/${jobId}/review`, { method: 'POST', headers: headers('customer'), body: JSON.stringify({ rating: 6 }) })).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/v1/jobs/${jobId}/review`, { method: 'POST', headers: headers('customer'), body: JSON.stringify({ rating: 3, unexpected: true }) })).status, 400)
  })
  assert.equal(reviews.created, 0)
})

test('duplicate review conflicts are surfaced safely', async () => {
  const reviews: ReviewStore = { createReview: async () => { throw new Error('Duplicate review') }, getProviderReviews: async () => [], getProviderRating: async () => ({ averageRating: null, reviewCount: 0 }) }
  await withServer(reviews, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/review`, { method: 'POST', headers: headers('customer'), body: JSON.stringify({ rating: 4 }) })
    assert.equal(response.status, 409)
  })
})
