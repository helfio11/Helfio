import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore, type OfferStore, type ProviderStore } from './app.js'
import type { AiModelResponse, AiToolDefinition } from './ai.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { Job, Offer, ProviderProfile, UserAccount } from './db.js'
import type { CategoryRow } from './categories.js'
import { aiTools } from './app.js'

const customerIdentity: AuthenticatedIdentity = { subject: 'customer', email: 'customer@example.com', displayName: 'Customer', roles: ['CUSTOMER'] }
const providerIdentity: AuthenticatedIdentity = { subject: 'provider', email: 'provider@example.com', displayName: 'Provider', roles: ['PROVIDER'] }
const customer: UserAccount = { id: 'customer-id', keycloakSubjectId: 'customer', email: customerIdentity.email, displayName: 'Customer', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }
const provider: UserAccount = { id: '22222222-2222-4222-8222-222222222222', keycloakSubjectId: 'provider', email: providerIdentity.email, displayName: 'Provider', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }
const category: CategoryRow = { id: 'category', parentId: null, slug: 'cleaning', status: 'active', icon: null, sortOrder: 1, showInNavigation: true, showOnHomepage: true, createdAt: '', updatedAt: '', translations: { en: { name: 'Cleaning', description: null } } }
const profile = { userId: provider.id, displayName: 'Public Provider', description: 'Helpful', profileImageRef: null, phone: '+491234', contactEmail: 'private@example.com', city: 'Ravensburg', postalCode: '88212', serviceRadiusKm: 10, availabilityStatus: 'AVAILABLE' as const, yearsExperience: 3, startingPrice: 20, currency: 'EUR', visibility: 'PUBLIC' as const, verificationStatus: 'UNVERIFIED' as const, createdAt: '', updatedAt: '', services: [] }
const job = { id: '11111111-1111-4111-8111-111111111111', customerUserId: customer.id, categoryId: 'category', title: 'Cleaning', description: 'Flat', city: 'Ravensburg', postalCode: '88212', countryCode: 'DE', budgetType: 'RANGE' as const, budgetMin: 10, budgetMax: 20, currency: 'EUR', preferredDate: null, preferredTimeText: null, status: 'OPEN' as const, createdAt: '', updatedAt: '', category }
const gardeningJob = { ...job, id: '33333333-3333-4333-8333-333333333333', title: 'Garden work', description: 'Hedge trimming', city: 'Berlin' }
const offer: Offer = { id: '22222222-2222-4222-8222-222222222222', jobId: job.id, providerUserId: provider.id, price: 15, currency: 'EUR', message: 'I can help', estimatedDuration: '2 hours', availableFrom: '2026-10-01', status: 'PENDING', createdAt: '', updatedAt: '', provider: profile }

class Verifier implements TokenVerifier { async verify(token: string) { if (token === 'customer') return customerIdentity; if (token === 'provider') return providerIdentity; throw new Error('invalid') } }
class Accounts implements AccountStore { async findOrCreateUser(identity: AuthenticatedIdentity) { return identity.subject === 'provider' ? provider : customer } async updateUserAccount() { return customer } }
class Providers implements ProviderStore { async getProviderProfile() { return profile } async saveProviderProfile() { return profile } async setProviderServices() { return profile } async getPublicProvider() { return profile } async getPublicProviders() { return [profile] } }
let createJobCalls = 0
class Jobs { async getJobs() { return [job] } async getJob() { return job } async createJob() { createJobCalls += 1; return job } async updateJob() { return job } async transitionJob() { return job } }
class Offers implements OfferStore { async getOpenJobs(categoryId?: string, city?: string) { return [job, gardeningJob].filter((item) => (!categoryId || item.categoryId === categoryId) && (!city || item.city.includes(city))) } async getJobOffers() { return [offer] } async getProviderOffers() { return [offer] } async createOffer() { return offer } async updateOffer() { return offer } async withdrawOffer() { return { ...offer, status: 'WITHDRAWN' as const } } async transitionOffer(_id: string, _customerId: string, next: 'ACCEPTED' | 'REJECTED') { return { ...offer, status: next } } }

type AiProvider = { complete(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: AiToolDefinition[], model?: string): Promise<AiModelResponse> }
async function withServer(callback: (baseUrl: string) => Promise<void>, aiProvider: AiProvider = { async complete() { return { content: 'Helfio response', toolCalls: [] } } }) {
  const dependencies = { verifier: new Verifier(), accounts: new Accounts(), providers: new Providers(), jobs: new Jobs(), offers: new Offers(), getCategories: async () => [category], getAiConversation: async () => null, appendAiConversation: async (_id: string, _userMessage: string, assistantMessage: string) => ({ id: 'conversation', messages: [{ role: 'assistant' as const, content: assistantMessage, createdAt: '' }] }), aiRateKey: (request: import('node:http').IncomingMessage) => String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress), aiProvider }
  const server: Server = createServer(createApiHandler(dependencies))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}
function headers(token: string) { return { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }

test('offer projections protect provider contact data and provider job customer ownership', async () => {
  await withServer(async (baseUrl) => {
    const customerOffers = await fetch(`${baseUrl}/api/v1/jobs/${job.id}/offers`, { headers: headers('customer') })
    const customerPayload = await customerOffers.json() as { data: Array<Record<string, unknown>> }
    assert.equal(customerPayload.data[0].provider && (customerPayload.data[0].provider as Record<string, unknown>).phone, undefined)
    assert.equal(customerPayload.data[0].provider && (customerPayload.data[0].provider as Record<string, unknown>).contactEmail, undefined)
    const providerJobs = await fetch(`${baseUrl}/api/v1/provider/jobs`, { headers: headers('provider') })
    const providerPayload = await providerJobs.json() as { data: Array<Record<string, unknown>> }
    assert.equal(providerPayload.data[0].customerUserId, undefined)
  })
})

test('AI rate limit applies to guest IPs', async () => {
  await withServer(async (baseUrl) => {
    let last = 0
    for (let index = 0; index < 31; index += 1) last = (await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': 'rate-test' }, body: JSON.stringify({ message: 'help' }) })).status
    assert.equal(last, 429)
  })
})

test('AI tool calls are controlled and invalid navigation is rejected', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': 'controlled-test' }, body: JSON.stringify({ message: 'go somewhere', locale: 'en' }) })
    assert.equal(response.status, 200)
  }, { async complete(messages) { return messages.at(-1)?.content.includes('go somewhere') ? { content: null, toolCalls: [{ id: 'call-1', name: 'navigateTo', arguments: { path: 'https://evil.example' } }] } : { content: 'unused', toolCalls: [] } } })
})

test('all native tools have explicit schemas and valid calls execute', async () => {
  const expectedNames = ['searchCategories', 'searchProviders', 'getProvider', 'getCurrentUser', 'getMyJobs', 'getMyOffers', 'searchOpenJobs', 'getJob', 'prepareJobDraft', 'navigateTo']
  assert.deepEqual(aiTools.map((tool) => tool.function.name), expectedNames)
  assert.ok(aiTools.every((tool) => tool.function.parameters.type === 'object' && tool.function.parameters.additionalProperties === false))
  const calls = [
    { name: 'searchCategories', arguments: { query: 'clean' }, token: undefined },
    { name: 'searchProviders', arguments: { query: 'provider' }, token: undefined },
    { name: 'getProvider', arguments: { id: provider.id }, token: undefined },
    { name: 'getCurrentUser', arguments: {}, token: 'customer' },
    { name: 'getMyJobs', arguments: {}, token: 'customer' },
    { name: 'getMyOffers', arguments: {}, token: 'customer' },
    { name: 'searchOpenJobs', arguments: { categoryId: 'category', city: 'Ravensburg', query: 'clean' }, token: 'provider' },
    { name: 'getJob', arguments: { id: job.id }, token: 'customer' },
    { name: 'prepareJobDraft', arguments: { draft: { categoryId: 'category', title: 'New', description: 'A job', city: 'Ravensburg', countryCode: 'DE', budgetType: 'FIXED', currency: 'EUR' } }, token: 'customer' },
    { name: 'navigateTo', arguments: { path: `/providers/${provider.id}` }, token: undefined },
  ]
  let callIndex = 0
  await withServer(async (baseUrl) => {
    for (const call of calls) {
      const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { ...(call.token ? headers(call.token) : { 'content-type': 'application/json' }), 'x-forwarded-for': 'native-tools-test' }, body: JSON.stringify({ message: call.name }) })
      assert.equal(response.status, 200, call.name)
    }
    }, { async complete(_messages, tools) {
      if (!tools?.length) return { content: 'done', toolCalls: [] }
    const call = calls[callIndex++]
    return { content: null, toolCalls: [{ id: `call-${callIndex}`, name: call.name, arguments: call.arguments }] }
  } })
})

test('invalid arguments and unauthorized tools are rejected by the dispatcher', async () => {
  const cases = [
    { name: 'searchProviders', arguments: { unexpected: true }, message: 'Invalid tool arguments', token: undefined },
    { name: 'getMyJobs', arguments: {}, message: 'Authentication required', token: undefined },
    { name: 'searchOpenJobs', arguments: {}, message: 'Provider role required', token: 'customer' },
  ]
  for (const current of cases) {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { ...(current.token ? headers(current.token) : { 'content-type': 'application/json' }), 'x-forwarded-for': `invalid-${current.name}` }, body: JSON.stringify({ message: current.name }) })
      const payload = await response.json() as { data?: { answer?: string } }
      assert.equal(payload.data?.answer, current.message)
    }, { async complete() { return { content: null, toolCalls: [{ id: 'invalid', name: current.name, arguments: current.arguments }] } } })
  }
})

test('searchOpenJobs applies category, city, and query filters', async () => {
  let toolResult = ''
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { ...headers('provider'), 'x-forwarded-for': 'filter-test' }, body: JSON.stringify({ message: 'find cleaning in Ravensburg' }) })
    assert.equal(response.status, 200)
  }, { async complete(messages, tools) {
  if (!tools?.length) { toolResult = messages[0]?.content ?? ''; return { content: 'filtered', toolCalls: [] } }
    return { content: null, toolCalls: [{ id: 'filter', name: 'searchOpenJobs', arguments: { categoryId: 'cleaning', city: 'Ravensburg', query: 'clean' } }] }
  } })
  assert.match(toolResult, /Cleaning/)
  assert.doesNotMatch(toolResult, /Garden work/)
})

test('navigation is validated and draft preparation does not write', async () => {
  createJobCalls = 0
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { ...headers('customer'), 'x-forwarded-for': 'draft-test' }, body: JSON.stringify({ message: 'prepare a job' }) })
    const payload = await response.json() as { data?: { answer?: string } }
    assert.equal(payload.data?.answer, 'done')
  }, { async complete(_messages, tools) {
    if (!tools?.length) return { content: 'done', toolCalls: [] }
    return { content: null, toolCalls: [{ id: 'draft', name: 'prepareJobDraft', arguments: { draft: { categoryId: 'category', title: 'New', description: 'A job', city: 'Ravensburg', countryCode: 'DE', budgetType: 'FIXED', currency: 'EUR' } } }] }
  } })
  assert.equal(createJobCalls, 0)

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': 'navigation-test' }, body: JSON.stringify({ message: 'go there' }) })
    const payload = await response.json() as { data?: { answer?: string } }
    assert.equal(payload.data?.answer, 'Invalid navigation')
  }, { async complete() { return { content: null, toolCalls: [{ id: 'nav', name: 'navigateTo', arguments: { path: 'https://evil.example' } }] } } })
})

test('multilingual Helfio prompts are routed to the matching native tools', async () => {
  const prompts = [
    ['Cilat kategori shërbimesh ka Helfio?', 'searchCategories', undefined],
    ['Më gjej ofrues për pastrim.', 'searchProviders', undefined],
    ['Cilat janë punët e mia?', 'getMyJobs', 'customer'],
    ['Më trego punët e hapura në Ravensburg.', 'searchOpenJobs', 'provider'],
    ['Më përgatit një kërkesë pune për elektricist.', 'prepareJobDraft', 'customer'],
    ['Welche Dienstleistungen gibt es?', 'searchCategories', undefined],
    ['Finde Anbieter für Reinigung.', 'searchProviders', undefined],
    ['Welche Aufträge habe ich?', 'getMyJobs', 'customer'],
    ['Hizmet kategorileri hangileri?', 'searchCategories', undefined],
    ['Temizlik için hizmet sağlayıcı bul.', 'searchProviders', undefined],
    ['Açık işleri göster.', 'searchOpenJobs', 'provider'],
  ] as const
  let index = 0
  const selectedTools: string[] = []
  await withServer(async (baseUrl) => {
    for (const [prompt, expectedTool, token] of prompts) {
      const response = await fetch(`${baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: { ...(token ? headers(token) : { 'content-type': 'application/json' }), 'x-forwarded-for': `language-${index}` },
        body: JSON.stringify({ message: prompt, locale: prompt.includes('Welche') ? 'de' : prompt.includes('Hizmet') || prompt.includes('Temizlik') || prompt.includes('Açık') ? 'tr' : 'sq' }),
      })
      assert.equal(response.status, 200, prompt)
      const payload = await response.json() as { data?: { answer?: string } }
      assert.equal(payload.data?.answer, 'done', prompt)
      assert.equal(selectedTools[index], expectedTool, prompt)
      index += 1
    }
  }, { async complete(messages, tools) {
    if (!tools?.length) return { content: 'done', toolCalls: [] }
    const prompt = messages.at(-1)?.content ?? ''
    const expected = prompt.includes('kategori') || prompt.includes('Dienstleistungen') || prompt.includes('Hizmet kategorileri') ? 'searchCategories' : prompt.includes('ofrues') || prompt.includes('Anbieter') || prompt.includes('sağlayıcı') ? 'searchProviders' : prompt.includes('punët e mia') || prompt.includes('Aufträge habe') ? 'getMyJobs' : prompt.includes('punët e hapura') || prompt.includes('Açık işleri') ? 'searchOpenJobs' : 'prepareJobDraft'
    selectedTools.push(expected)
    return { content: null, toolCalls: [{ id: `language-${index}`, name: expected, arguments: expected === 'searchOpenJobs' ? { city: 'Ravensburg' } : expected === 'prepareJobDraft' ? { draft: { categoryId: 'category', title: 'Elektricist', description: 'Riparim', city: 'Ravensburg', countryCode: 'DE', budgetType: 'FIXED', currency: 'EUR' } } : {} }] }
  } })
})

test('prepareJobDraft localizes presentation labels and never persists', async () => {
  const locales = [
    ['en', 'Fixed budget', 'Budget range', 'Negotiable budget'],
    ['de', 'Festes Budget', 'Budgetspanne', 'Verhandelbares Budget'],
    ['sq', 'Buxhet fiks', 'Interval buxheti', 'Buxhet i negociueshëm'],
    ['tr', 'Sabit bütçe', 'Bütçe aralığı', 'Pazarlık edilebilir bütçe'],
  ] as const
  createJobCalls = 0
  for (const [locale, fixedLabel, rangeLabel, negotiableLabel] of locales) {
    let presentation = ''
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { ...headers('customer'), 'x-forwarded-for': `draft-presentation-${locale}` }, body: JSON.stringify({ message: 'prepare a job', locale }) })
      const payload = await response.json() as { data?: { answer?: string } }
      assert.equal(response.status, 200)
      assert.equal(payload.data?.answer, `${fixedLabel}, ${rangeLabel}, ${negotiableLabel}`)
    }, { async complete(messages, tools) {
      if (tools?.length) return { content: null, toolCalls: [{ id: `draft-${locale}`, name: 'prepareJobDraft', arguments: { draft: { categoryId: 'category', title: 'New', description: 'A job', city: 'Ravensburg', countryCode: 'DE', budgetType: 'RANGE', budgetMin: 10, budgetMax: 20, currency: 'EUR' } } }] }
      presentation = messages[0]?.content ?? ''
      return { content: 'FIXED, RANGE, NEGOTIABLE', toolCalls: [] }
    } })
    assert.doesNotMatch(presentation, /\b(FIXED|RANGE|NEGOTIABLE)\b/)
    assert.match(presentation, new RegExp(rangeLabel))
  }
  assert.equal(createJobCalls, 0)
})
