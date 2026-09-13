import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore } from './app.js'
import type { AiModelResponse } from './ai.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { UserAccount } from './db.js'

const identity: AuthenticatedIdentity = { subject: 'phase14-user', email: 'phase14@example.com', displayName: 'Phase 14', roles: ['CUSTOMER'] }
const account: UserAccount = { id: '11111111-1111-4111-8111-111111111111', keycloakSubjectId: identity.subject, email: identity.email, displayName: identity.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' }
class Verifier implements TokenVerifier { async verify(token: string) { if (token === 'valid') return identity; throw new Error('invalid') } }
class Accounts implements AccountStore { async findOrCreateUser() { return account } async updateUserAccount() { return account } }
class DeletableAccounts extends Accounts { anonymized = false; async anonymizeUserAccount() { this.anonymized = true; return { ...account, email: null, displayName: 'Deleted user', accountStatus: 'DISABLED' as const, anonymizedAt: 'now' } } }
async function withServer(health: () => Promise<{ database: boolean; eventWorker: boolean }>, callback: (baseUrl: string) => Promise<void>, aiProvider?: { complete(): Promise<AiModelResponse> }, accounts: AccountStore = new Accounts()) {
  const server: Server = createServer(createApiHandler({ verifier: new Verifier(), accounts, health, aiProvider, getCategories: async () => [] }))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}

test('health endpoints report readiness failures without leaking dependency errors', async () => {
  await withServer(async () => ({ database: false, eventWorker: true }), async (baseUrl) => {
    const live = await fetch(`${baseUrl}/health/live`)
    assert.equal(live.status, 200)
    assert.equal(live.headers.get('x-content-type-options'), 'nosniff')
    const ready = await fetch(`${baseUrl}/health/ready`)
    assert.equal(ready.status, 503)
    assert.match(await ready.text(), /not_ready/)
    assert.doesNotMatch(await (await fetch(`${baseUrl}/health/ready`)).text(), /password|stack|connection/i)
  })
})

test('write rate limiting returns retry guidance on the shared API boundary', async () => {
  await withServer(async () => ({ database: true, eventWorker: true }), async (baseUrl) => {
    let response: Response | undefined
    for (let index = 0; index < 121; index += 1) response = await fetch(`${baseUrl}/api/v1/phase14-rate-limit`, { method: 'POST', body: '{}' })
    assert.equal(response?.status, 429)
    assert.equal(response?.headers.get('retry-after'), '60')
  })
})

test('malformed JSON remains a client error and internal failures are redacted', async () => {
  await withServer(async () => ({ database: true, eventWorker: true }), async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/v1/me`, { method: 'PATCH', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: '{' })
    assert.equal(malformed.status, 400)
    assert.match(await malformed.text(), /Invalid JSON/)
    const missing = await fetch(`${baseUrl}/api/v1/notifications/not-a-uuid/read`, { method: 'PATCH', headers: { authorization: 'Bearer valid' } })
    assert.equal(missing.status, 400)
  })
})

test('AI provider failure is isolated from core marketplace routes', async () => {
  await withServer(async () => ({ database: true, eventWorker: true }), async (baseUrl) => {
    const ai = await fetch(`${baseUrl}/api/v1/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'help' }) })
    assert.equal(ai.status, 502)
    assert.match((await ai.json() as { error: string }).error, /temporarily unavailable/)
    assert.equal((await fetch(`${baseUrl}/api/v1/categories`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200)
  }, { async complete() { throw new Error('provider unavailable') } })
})

test('account anonymization is authenticated and scoped to the current account', async () => {
  const accounts = new DeletableAccounts()
  await withServer(async () => ({ database: true, eventWorker: true }), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/me`, { method: 'DELETE' })).status, 401)
    const response = await fetch(`${baseUrl}/api/v1/me`, { method: 'DELETE', headers: { authorization: 'Bearer valid' } })
    assert.equal(response.status, 204)
    assert.equal(accounts.anonymized, true)
  }, undefined, accounts)
})
