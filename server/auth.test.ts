import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { PreferredLocale, UserAccount } from './db.js'

const identity: AuthenticatedIdentity = { subject: 'kc-user-1', email: 'user@example.com', displayName: 'Test User', roles: ['CUSTOMER'] }
const baseAccount: UserAccount = { id: 'user-1', keycloakSubjectId: identity.subject, email: identity.email, displayName: identity.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01' }

class FakeVerifier implements TokenVerifier {
  async verify(token: string): Promise<AuthenticatedIdentity> {
    if (token === 'valid') return identity
    if (token === 'provider') return { ...identity, roles: ['PROVIDER'] }
    if (token === 'admin') return { ...identity, roles: ['ADMIN'] }
    throw new Error('invalid token')
  }
}

class FakeAccounts implements AccountStore {
  account = { ...baseAccount }
  calls = 0
  creates = 0
  updates = 0
  async findOrCreateUser(currentIdentity: AuthenticatedIdentity) {
    this.calls += 1
    if (this.calls === 1) this.creates += 1
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

async function withServer(accounts: FakeAccounts, callback: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(createApiHandler({ verifier: new FakeVerifier(), accounts }))
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
