import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AccountStore, type MessagingStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'
import type { Conversation, ConversationInput, Message, PreferredLocale, PushSubscription, UserAccount } from './db.js'

const customer: AuthenticatedIdentity = { subject: 'customer-kc', email: 'customer@example.com', displayName: 'Customer', roles: ['CUSTOMER'] }
const provider: AuthenticatedIdentity = { subject: 'provider-kc', email: 'provider@example.com', displayName: 'Provider', roles: ['PROVIDER'] }
const other: AuthenticatedIdentity = { subject: 'other-kc', email: 'other@example.com', displayName: 'Other', roles: ['CUSTOMER'] }
const accounts: Record<string, UserAccount> = {
  valid: { id: 'customer-id', keycloakSubjectId: customer.subject, email: customer.email, displayName: customer.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' },
  provider: { id: 'provider-id', keycloakSubjectId: provider.subject, email: provider.email, displayName: provider.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' },
  other: { id: 'other-id', keycloakSubjectId: other.subject, email: other.email, displayName: other.displayName, preferredLocale: 'en', accountStatus: 'ACTIVE', createdAt: '', updatedAt: '' },
}
const baseConversation = (): Conversation => ({ id: 'conversation-id', customerUserId: 'customer-id', providerUserId: 'provider-id', jobId: '11111111-1111-4111-8111-111111111111', offerId: '22222222-2222-4222-8222-222222222222', jobTitle: 'Repair kitchen', offerStatus: 'ACCEPTED', updatedAt: '', messages: [], unreadCount: 0 })

class FakeVerifier implements TokenVerifier {
  async verify(token: string) { if (accounts[token]) return token === 'provider' ? provider : token === 'other' ? other : customer; throw new Error('invalid') }
}
class FakeAccounts implements AccountStore {
  async findOrCreateUser(identity: AuthenticatedIdentity) { return Object.values(accounts).find((account) => account.keycloakSubjectId === identity.subject)! }
  async updateUserAccount(id: string, changes: { displayName?: string | null; preferredLocale?: PreferredLocale }) { return { ...Object.values(accounts).find((account) => account.id === id)!, ...changes } }
}
class FakeMessaging implements MessagingStore {
  conversation = baseConversation()
  messages: Message[] = []
  subscriptions: PushSubscription[] = []
  async getConversations(userId: string) { return this.isParticipant(userId) ? [{ ...this.conversation, messages: this.messages, unreadCount: this.unread(userId) }] : [] }
  async getConversation(id: string, userId: string) { return id === this.conversation.id && this.isParticipant(userId) ? { ...this.conversation, messages: this.messages, unreadCount: this.unread(userId) } : null }
  async createConversation(userId: string, input: ConversationInput) { if (userId !== 'customer-id' || input.jobId !== this.conversation.jobId || input.offerId !== this.conversation.offerId) throw new Error('Invalid conversation context'); return this.conversation }
  async sendMessage(conversationId: string, userId: string, content: string) { if (conversationId !== this.conversation.id || !this.isParticipant(userId)) throw new Error('Conversation access denied'); const message = { id: `message-${this.messages.length + 1}`, conversationId, senderUserId: userId, content, readAt: null, createdAt: '' }; this.messages.push(message); return message }
  async markConversationRead(conversationId: string, userId: string) { if (!this.isParticipant(userId) || conversationId !== this.conversation.id) throw new Error('Conversation access denied'); let count = 0; for (const message of this.messages) if (message.senderUserId !== userId && !message.readAt) { message.readAt = 'now'; count += 1 } return count }
  async getUnreadMessageCount(userId: string) { return this.unread(userId) }
  async savePushSubscription(_userId: string, subscription: PushSubscription) { this.subscriptions = [subscription] }
  async getPushSubscriptions(_userId: string) { return [] }
  private isParticipant(userId: string) { return userId === this.conversation.customerUserId || userId === this.conversation.providerUserId }
  private unread(userId: string) { return this.messages.filter((message) => message.senderUserId !== userId && !message.readAt).length }
}

async function withServer(messaging: FakeMessaging, callback: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(createApiHandler({ verifier: new FakeVerifier(), accounts: new FakeAccounts(), messaging }))
  await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address')
  try { await callback(`http://127.0.0.1:${address.port}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}
async function request(baseUrl: string, path: string, token: string, init?: RequestInit) { return fetch(`${baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } }) }

 test('inbox participants can read and cross-user access is denied', async () => {
  const messaging = new FakeMessaging(); await withServer(messaging, async (baseUrl) => {
    assert.equal((await request(baseUrl, '/api/v1/inbox', 'valid')).status, 200)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations/conversation-id', 'provider')).status, 200)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations/conversation-id', 'other')).status, 403)
  })
})

test('conversation creation requires customer-owned matching offer context', async () => {
  const messaging = new FakeMessaging(); await withServer(messaging, async (baseUrl) => {
    const headers = { 'content-type': 'application/json' }
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations', 'provider', { method: 'POST', headers, body: JSON.stringify({ jobId: messaging.conversation.jobId, offerId: messaging.conversation.offerId }) })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations', 'valid', { method: 'POST', headers, body: JSON.stringify({ jobId: messaging.conversation.jobId, offerId: 'bad' }) })).status, 400)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations', 'valid', { method: 'POST', headers, body: JSON.stringify({ jobId: messaging.conversation.jobId, offerId: messaging.conversation.offerId }) })).status, 201)
  })
})

test('send, unread count, read state, and push subscription handling are enforced', async () => {
  const messaging = new FakeMessaging(); await withServer(messaging, async (baseUrl) => {
    const headers = { 'content-type': 'application/json' }
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations/conversation-id/messages', 'valid', { method: 'POST', headers, body: JSON.stringify({ content: 'Hello provider' }) })).status, 201)
    assert.equal(((await (await request(baseUrl, '/api/v1/inbox/unread', 'provider')).json()) as { data: { count: number } }).data.count, 1)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations/conversation-id/read', 'provider', { method: 'POST' })).status, 200)
    assert.equal(((await (await request(baseUrl, '/api/v1/inbox/unread', 'provider')).json()) as { data: { count: number } }).data.count, 0)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations/conversation-id/messages', 'other', { method: 'POST', headers, body: JSON.stringify({ content: 'No access' }) })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/inbox/conversations/conversation-id/read', 'other', { method: 'POST' })).status, 403)
    assert.equal((await request(baseUrl, '/api/v1/inbox/push-subscription', 'provider', { method: 'PUT', headers, body: JSON.stringify({ endpoint: 'https://push.example/sub', keys: { p256dh: 'key', auth: 'auth' } }) })).status, 204)
    assert.equal(messaging.subscriptions[0].endpoint, 'https://push.example/sub')
    assert.equal((await request(baseUrl, '/api/v1/inbox/push-subscription', 'provider', { method: 'PUT', headers, body: JSON.stringify({ endpoint: 'http://bad', keys: {} }) })).status, 400)
  })
})
