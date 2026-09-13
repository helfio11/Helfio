import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore, type NotificationStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { NotificationView } from './notifications.js'
import type { PreferredLocale, UserAccount } from './db.js'

const customerIdentity: AuthenticatedIdentity = { subject: 'customer', email: 'customer@example.com', displayName: 'Customer', roles: ['CUSTOMER'] }
const otherIdentity: AuthenticatedIdentity = { subject: 'other', email: 'other@example.com', displayName: 'Other', roles: ['CUSTOMER'] }
const accounts: Record<string, UserAccount> = {
  customer: { id: '11111111-1111-4111-8111-111111111111', keycloakSubjectId: 'customer', email: customerIdentity.email, displayName: 'Customer', preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' },
  other: { id: '22222222-2222-4222-8222-222222222222', keycloakSubjectId: 'other', email: otherIdentity.email, displayName: 'Other', preferredLocale: 'de', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' },
}
const notification: NotificationView = { id: '33333333-3333-4333-8333-333333333333', eventId: '44444444-4444-4444-8444-444444444444', eventType: 'offer.created', title: 'New offer received', body: 'A provider sent an offer for your job.', createdAt: '', readAt: null }

class Verifier implements TokenVerifier {
  async verify(token: string) { if (token === 'customer') return customerIdentity; if (token === 'other') return otherIdentity; throw new Error('invalid') }
}
class Accounts implements AccountStore {
  async findOrCreateUser(identity: AuthenticatedIdentity) { return accounts[identity.subject] }
  async updateUserAccount(id: string, changes: { displayName?: string | null; preferredLocale?: PreferredLocale }) { return { ...Object.values(accounts).find((account) => account.id === id)!, ...changes } }
}
class Notifications implements NotificationStore {
  items = new Map(Object.entries({ [accounts.customer.id]: [notification] }))
  async list(userId: string) { return this.items.get(userId) ?? [] }
  async unreadCount(userId: string) { return (this.items.get(userId) ?? []).filter((item) => !item.readAt).length }
  async markRead(id: string, userId: string) { const item = (this.items.get(userId) ?? []).find((value) => value.id === id); if (!item) return false; item.readAt = 'now'; return true }
  async markAllRead(userId: string) { const items = this.items.get(userId) ?? []; let count = 0; for (const item of items) if (!item.readAt) { item.readAt = 'now'; count += 1 } return count }
}

async function withServer(notifications: Notifications, callback: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(createApiHandler({ verifier: new Verifier(), accounts: new Accounts(), notifications }))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}
async function request(baseUrl: string, path: string, token?: string, init?: RequestInit) { return fetch(`${baseUrl}${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } }) }

test('notifications require authentication and only expose the owner data', async () => {
  const notifications = new Notifications()
  await withServer(notifications, async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/v1/notifications')).status, 401)
    const own = await request(baseUrl, '/api/v1/notifications', 'customer')
    assert.equal(own.status, 200)
    assert.equal(((await own.json()) as { data: { items: NotificationView[]; unreadCount: number } }).data.unreadCount, 1)
    const other = await request(baseUrl, `/api/v1/notifications/${notification.id}/read`, 'other', { method: 'PATCH' })
    assert.equal(other.status, 404)
  })
})

test('notifications support idempotent read and read-all operations', async () => {
  const notifications = new Notifications()
  await withServer(notifications, async (baseUrl) => {
    assert.equal((await request(baseUrl, `/api/v1/notifications/${notification.id}/read`, 'customer', { method: 'PATCH' })).status, 200)
    assert.equal((await request(baseUrl, `/api/v1/notifications/${notification.id}/read`, 'customer', { method: 'PATCH' })).status, 200)
    const all = await request(baseUrl, '/api/v1/notifications/read-all', 'customer', { method: 'PATCH' })
    assert.equal(all.status, 200)
    assert.equal(((await all.json()) as { data: { unreadCount: number } }).data.unreadCount, 0)
  })
})
