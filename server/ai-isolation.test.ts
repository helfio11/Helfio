import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'

const customerIdentity: AuthenticatedIdentity = { subject: 'ai-customer', email: 'customer@example.com', displayName: 'Customer', roles: ['CUSTOMER'] }
const providerIdentity: AuthenticatedIdentity = { subject: 'ai-provider', email: 'provider@example.com', displayName: 'Provider', roles: ['PROVIDER'] }
const adminIdentity: AuthenticatedIdentity = { subject: 'ai-admin', email: 'admin@example.com', displayName: 'Admin', roles: ['ADMIN'] }
const accounts = new Map([
  ['ai-customer', { id: '11111111-1111-4111-8111-111111111111', keycloakSubjectId: 'ai-customer', email: customerIdentity.email, displayName: 'Customer', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }],
  ['ai-provider', { id: '22222222-2222-4222-8222-222222222222', keycloakSubjectId: 'ai-provider', email: providerIdentity.email, displayName: 'Provider', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }],
  ['ai-admin', { id: '33333333-3333-4333-8333-333333333333', keycloakSubjectId: 'ai-admin', email: adminIdentity.email, displayName: 'Admin', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }],
])
const job = { id: '44444444-4444-4444-8444-444444444444', customerUserId: accounts.get('ai-customer')!.id, assignedProviderUserId: null, categoryId: '55555555-5555-4555-8555-555555555555', title: 'Test job', description: 'Test description', city: 'Berlin', postalCode: null, countryCode: 'DE', budgetType: 'FIXED', budgetMin: 10, budgetMax: 10, currency: 'EUR', preferredDate: null, preferredTimeText: null, status: 'DRAFT', createdAt: '', updatedAt: '', assignedAt: null, startedAt: null, finishedAt: null, completedAt: null, cancelledAt: null, category: { id: '55555555-5555-4555-8555-555555555555', parentId: null, slug: 'cleaning', status: 'active', icon: null, sortOrder: 1, showInNavigation: true, showOnHomepage: true, createdAt: '', updatedAt: '', translations: {} } }
const offer = { id: '66666666-6666-4666-8666-666666666666', jobId: job.id, providerUserId: accounts.get('ai-provider')!.id, price: 10, currency: 'EUR', message: 'I can help', estimatedDuration: null, availableFrom: null, status: 'PENDING', createdAt: '', updatedAt: '', provider: null }
class Verifier implements TokenVerifier { async verify(token: string) { if (token === 'customer') return customerIdentity; if (token === 'provider') return providerIdentity; if (token === 'admin') return adminIdentity; throw new Error('invalid') } }
const accountStore = { async findOrCreateUser(identity: AuthenticatedIdentity) { return accounts.get(identity.subject)! }, async updateUserAccount() { return accounts.get('ai-customer')! } }
const jobs = { async getJobs() { return [job] }, async getAssignedJobs() { return [job] }, async getJob() { return job }, async createJob() { return job }, async updateJob() { return job }, async transitionJob() { return job }, async startJob() { return job }, async finishJob() { return job }, async confirmJob() { return job } }
const offers = { async getOpenJobs() { return [job] }, async getJobOffers() { return [offer] }, async getProviderOffers() { return [offer] }, async createOffer() { return offer }, async updateOffer() { return offer }, async withdrawOffer() { return offer }, async transitionOffer() { return offer } }
const providers = { async getProviderProfile() { return null }, async saveProviderProfile() { return null }, async setProviderServices() { return null }, async getPublicProvider() { return { userId: offer.providerUserId, displayName: 'Provider', description: '', profileImageRef: null, city: 'Berlin', postalCode: '10115', serviceRadiusKm: 10, availabilityStatus: 'AVAILABLE', yearsExperience: 1, startingPrice: 10, currency: 'EUR', visibility: 'PUBLIC', verificationStatus: 'UNVERIFIED', createdAt: '', updatedAt: '', services: [], rating: null } }, async getPublicProviders() { return [] } }
const messaging = { async getConversations() { return [] }, async getConversation() { return null }, async createConversation() { throw new Error('unused') }, async sendMessage() { throw new Error('unused') }, async markConversationRead() { return 0 }, async getUnreadMessageCount() { return 0 }, async savePushSubscription() {}, async getPushSubscriptions() { return [] } }
const notifications = { async list() { return [] }, async unreadCount() { return 0 }, async markRead() { return false }, async markAllRead() { return 0 } }
const reviews = { async createReview() { return { id: '77777777-7777-4777-8777-777777777777', jobId: job.id, providerUserId: offer.providerUserId, rating: 5, comment: null, reviewerDisplayName: 'Customer', createdAt: '', updatedAt: '' } }, async getProviderReviews() { return [] }, async getProviderRating() { return { averageRating: null, reviewCount: 0 } } }
const admin = { async dashboard() { return { totalUsers: 3, customers: 1, providers: 1, activeJobs: 0, completedJobs: 0, reviews: 0, recentActivity: [] } } } as any
const page = <T>(items: T[]) => ({ items, page: 1, pageSize: 12, total: items.length, hasNext: false })

async function withServer(callback: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(createApiHandler({ verifier: new Verifier(), accounts: accountStore as any, providers: providers as any, jobs: jobs as any, offers: offers as any, messaging: messaging as any, notifications: notifications as any, reviews: reviews as any, admin, getCategories: async () => [], search: async () => ({ providers: page([]), jobs: page([]), categories: page([]) }), aiProvider: { async complete() { throw new Error('forced AI outage') } } }))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  const previousRollbackMode = process.env.MARKETPLACE_ROLLBACK_MODE
  process.env.MARKETPLACE_ROLLBACK_MODE = 'true'
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())); if (previousRollbackMode === undefined) delete process.env.MARKETPLACE_ROLLBACK_MODE; else process.env.MARKETPLACE_ROLLBACK_MODE = previousRollbackMode }
}
function auth(token: string) { return { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }

test('AI outage leaves every representative core API boundary available', async () => {
  await withServer(async (baseUrl) => {
    const ai = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'help' }) })
    assert.equal(ai.status, 502)
    const checks: Array<[string, string, string, number]> = [
      ['auth/me', '/api/v1/me', 'customer', 200],
      ['categories', '/api/v1/categories', '', 200],
      ['search', '/api/v1/search', '', 200],
      ['jobs', '/api/v1/jobs', 'customer', 200],
      ['offers', '/api/v1/provider/offers', 'provider', 200],
      ['messaging/inbox', '/api/v1/inbox', 'customer', 200],
      ['reviews', `/api/v1/providers/${offer.providerUserId}/reviews`, '', 200],
      ['notifications', '/api/v1/notifications', 'customer', 200],
      ['admin authorization', '/api/v1/admin/dashboard', 'admin', 200],
      ['health', '/health/live', '', 200],
    ]
    for (const [name, path, token, expected] of checks) assert.equal((await fetch(`${baseUrl}${path}`, token ? { headers: auth(token) } : undefined)).status, expected, name)
  })
})
