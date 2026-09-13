import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApiHandler, type AdminStore } from './app.js'
import type { AuthenticatedIdentity, TokenVerifier } from './auth.js'

const account = { id: 'admin-1', keycloakSubjectId: 'admin', email: 'admin@example.com', displayName: 'Admin', preferredLocale: 'en' as const, accountStatus: 'ACTIVE' as const, createdAt: '', updatedAt: '' }
const page = <T>(items: T[]) => ({ items, page: 1, pageSize: 25, total: items.length, hasNext: false })
const category = { id: 'category-1', parentId: null, slug: 'cleaning', status: 'active' as const, icon: null, sortOrder: 1, showInNavigation: true, showOnHomepage: true, createdAt: '', updatedAt: '', translations: { en: { name: 'Cleaning', description: null }, de: { name: 'Reinigung', description: null }, sq: { name: 'Pastrim', description: null }, tr: { name: 'Temizlik', description: null } } }
class Verifier implements TokenVerifier { async verify(token: string): Promise<AuthenticatedIdentity> { if (token === 'admin') return { subject: 'admin', email: account.email, displayName: account.displayName, roles: ['ADMIN'] }; if (token === 'customer') return { subject: 'customer', email: 'customer@example.com', displayName: 'Customer', roles: ['CUSTOMER'] }; throw new Error('invalid') } }
function fakeAdmin() { const audits: unknown[][] = []; const store = { dashboard: async () => ({ totalUsers: 1, customers: 1, providers: 0, activeJobs: 0, completedJobs: 0, reviews: 0, recentActivity: [] }), users: async () => page([]), providers: async () => page([]), jobs: async () => page([]), reviews: async () => page([{ id: 'review-1', moderationStatus: 'HIDDEN' }]), categories: async () => [category], createCategory: async (input: typeof category) => ({ ...category, ...input }), updateCategory: async (id: string, input: typeof category) => ({ ...category, ...input, id }), updateUserStatus: async () => ({ ...account, roles: [] }), updateProviderStatus: async () => ({}), moderateReview: async (id: string, status: 'VISIBLE' | 'HIDDEN') => ({ id, moderationStatus: status }), auditLog: async () => page([]), recordAudit: async (...args: unknown[]) => { audits.push(args) }, settings: async () => ({}), updateSettings: async () => ({}) } as unknown as AdminStore; return { store, audits } }
async function withServer(callback: (base: string, admin: ReturnType<typeof fakeAdmin>) => Promise<void>) { const admin = fakeAdmin(); const server = createServer(createApiHandler({ verifier: new Verifier(), accounts: { findOrCreateUser: async () => account, updateUserAccount: async () => account }, admin: admin.store })); await new Promise<void>((resolve) => server.listen(0, resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address'); try { await callback(`http://127.0.0.1:${address.port}`, admin) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) } }
const headers = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })

test('admin API requires ADMIN and records sensitive actions', async () => {
  await withServer(async (base, admin) => {
    assert.equal((await fetch(`${base}/api/v1/admin/dashboard`, { headers: headers('customer') })).status, 403)
    assert.equal((await fetch(`${base}/api/v1/admin/dashboard`, { headers: headers('admin') })).status, 200)
    const input = { parentId: null, slug: 'plumbing', status: 'active', icon: 'P', sortOrder: 2, showInNavigation: false, showOnHomepage: false, translations: { en: { name: 'Plumbing', description: null }, de: { name: 'Sanitär', description: null }, sq: { name: 'Hidraulikë', description: null }, tr: { name: 'Tesisat', description: null } } }
    assert.equal((await fetch(`${base}/api/v1/admin/categories`, { method: 'POST', headers: headers('admin'), body: JSON.stringify(input) })).status, 201)
    assert.equal((await fetch(`${base}/api/v1/admin/reviews/review-1/moderation`, { method: 'PATCH', headers: headers('admin'), body: JSON.stringify({ status: 'VISIBLE' }) })).status, 200)
    assert.equal(admin.audits.length, 2)
    assert.equal(JSON.stringify(admin.audits).includes('token'), false)
  })
})
