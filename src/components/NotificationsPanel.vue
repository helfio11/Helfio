<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAccessToken, useAuth } from '../auth/keycloak'

interface NotificationItem { id: string; eventType: string; title: string; body: string; createdAt: string; readAt: string | null }
const { t } = useI18n()
const { authenticated } = useAuth()
const items = ref<NotificationItem[]>([])
const unreadCount = ref(0)
const loading = ref(false)

async function api(path: string, init?: RequestInit) {
  const token = await getAccessToken()
  return fetch(path, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } })
}
async function refresh() {
  if (!authenticated.value) return
  loading.value = true
  const response = await api('/api/v1/notifications')
  if (response.ok) {
    const payload = await response.json() as { data: { items: NotificationItem[]; unreadCount: number } }
    items.value = payload.data.items; unreadCount.value = payload.data.unreadCount
  }
  loading.value = false
}
async function markRead(item: NotificationItem) {
  if (item.readAt) return
  const response = await api(`/api/v1/notifications/${item.id}/read`, { method: 'PATCH' })
  if (response.ok) { item.readAt = new Date().toISOString(); unreadCount.value = Math.max(0, unreadCount.value - 1); window.dispatchEvent(new Event('notifications-updated')) }
}
async function markAllRead() {
  const response = await api('/api/v1/notifications/read-all', { method: 'PATCH' })
  if (response.ok) { items.value.forEach((item) => { item.readAt ??= new Date().toISOString() }); unreadCount.value = 0; window.dispatchEvent(new Event('notifications-updated')) }
}
onMounted(() => void refresh())
</script>

<template>
  <section v-if="authenticated" id="notifications" class="notifications-panel container">
    <div class="notifications-heading"><div><span class="section-kicker">{{ t('notifications.kicker') }}</span><h2>{{ t('notifications.title') }} <b v-if="unreadCount">{{ unreadCount }}</b></h2></div><button class="job-secondary" type="button" :disabled="!unreadCount" @click="markAllRead">{{ t('notifications.readAll') }}</button></div>
    <p v-if="loading" class="job-empty">{{ t('notifications.loading') }}</p>
    <p v-else-if="!items.length" class="job-empty">{{ t('notifications.empty') }}</p>
    <div v-else class="notifications-list"><button v-for="item in items" :key="item.id" type="button" class="notification-item" :class="{ unread: !item.readAt }" @click="markRead(item)"><span class="notification-dot" aria-hidden="true" /><span><strong>{{ item.title }}</strong><small>{{ item.body }}</small></span><time :datetime="item.createdAt">{{ new Date(item.createdAt).toLocaleString() }}</time></button></div>
  </section>
</template>

<style scoped>
.notifications-panel{margin-top:32px;margin-bottom:0;padding:22px 28px;border:1px solid var(--line);border-radius:8px;background:#fff}.notifications-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.notifications-heading h2{font-family:Manrope,sans-serif;font-size:22px;margin:5px 0 0}.notifications-heading h2 b{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:5px;border-radius:10px;background:#dff0a8;color:#356d40;font-size:10px;vertical-align:middle}.notifications-list{display:grid;gap:7px;margin-top:16px}.notification-item{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:11px 0;border:0;border-top:1px solid var(--line);background:transparent;color:var(--ink);text-align:left}.notification-item span:nth-child(2){min-width:0}.notification-item strong,.notification-item small{display:block;overflow-wrap:anywhere}.notification-item strong{font-size:12px}.notification-item small{margin-top:3px;color:var(--muted);font-size:11px}.notification-item time{color:var(--muted);font-size:10px;white-space:nowrap}.notification-dot{width:7px;height:7px;border-radius:50%;background:transparent}.notification-item.unread .notification-dot{background:var(--green)}.notification-item.unread strong{font-weight:800}@media(max-width:650px){.notifications-panel{width:calc(100% - 32px);margin-top:20px;padding:18px 16px}.notifications-heading{align-items:flex-start}.notifications-heading h2{font-size:19px}.notification-item{grid-template-columns:8px minmax(0,1fr);align-items:start}.notification-item time{grid-column:2;font-size:9px}.notifications-heading .job-secondary{padding:8px 10px;font-size:10px}}
</style>
