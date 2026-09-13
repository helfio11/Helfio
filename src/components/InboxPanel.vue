<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAccessToken } from '../auth/keycloak'

const { t } = useI18n()
interface Message { id: string; senderUserId: string; content: string; createdAt: string }
interface Conversation { id: string; jobId: string; offerId: string | null; jobTitle: string; offerStatus: string | null; updatedAt: string; messages: Message[]; unreadCount: number }
const conversations = ref<Conversation[]>([])
const selected = ref<Conversation | null>(null)
const input = ref('')
const error = ref('')
const sending = ref(false)
const pushAvailable = ref(false)
let eventAbort: AbortController | null = null

async function api(path: string, init?: RequestInit) {
  const token = await getAccessToken()
  return fetch(path, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } })
}
async function refresh() {
  const response = await api('/api/v1/inbox')
  if (!response.ok) return
  conversations.value = (await response.json() as { data: Conversation[] }).data
  if (selected.value) selected.value = conversations.value.find((item) => item.id === selected.value?.id) ?? null
}
async function selectConversation(conversation: Conversation) {
  const response = await api(`/api/v1/inbox/conversations/${conversation.id}`)
  if (!response.ok) return
  selected.value = (await response.json() as { data: Conversation }).data
  await api(`/api/v1/inbox/conversations/${conversation.id}/read`, { method: 'POST' })
  await refresh()
  window.dispatchEvent(new Event('inbox-updated'))
}
async function send() {
  if (!selected.value || !input.value.trim() || sending.value) return
  sending.value = true; error.value = ''
  const response = await api(`/api/v1/inbox/conversations/${selected.value.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: input.value.trim() }) })
  if (!response.ok) error.value = t('inbox.sendError')
  else { input.value = ''; await selectConversation(selected.value) }
  sending.value = false
}
function decodeKey(value: string) { const padding = '='.repeat((4 - value.length % 4) % 4); const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(binary, (character) => character.charCodeAt(0)) }
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
  const permission = await Notification.requestPermission(); if (permission !== 'granted') return
  const registration = await navigator.serviceWorker.register('/sw.js')
  const keyResponse = await api('/api/v1/inbox/push-public-key'); const publicKey = (await keyResponse.json() as { data: { publicKey: string | null } }).data.publicKey
  if (!publicKey) return
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) })
  const response = await api('/api/v1/inbox/push-subscription', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
  pushAvailable.value = response.ok
}
async function connectEvents() {
  const token = await getAccessToken(); if (!token) return
  eventAbort = new AbortController()
  try {
    const response = await fetch('/api/v1/inbox/events', { headers: { authorization: `Bearer ${token}` }, signal: eventAbort.signal })
    if (!response.body) return
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const events = buffer.split('\n\n'); buffer = events.pop() ?? ''
      if (events.some((event) => event.startsWith('event: message'))) { await refresh(); window.dispatchEvent(new Event('inbox-updated')) }
    }
  } catch { /* The inbox remains usable with the regular refresh. */ }
}
onMounted(async () => { await refresh(); void connectEvents() })
onUnmounted(() => eventAbort?.abort())
</script>
<template>
  <section id="inbox" class="content-section container inbox-panel">
    <div class="section-heading"><div><span class="section-kicker">{{ t('inbox.kicker') }}</span><h2>{{ t('inbox.title') }}</h2><p>{{ t('inbox.description') }}</p></div><button v-if="!pushAvailable" class="job-secondary" type="button" @click="enablePush">{{ t('inbox.enableNotifications') }}</button></div>
    <div class="inbox-layout">
      <aside class="inbox-list"><p v-if="!conversations.length" class="job-empty">{{ t('inbox.empty') }}</p><button v-for="conversation in conversations" :key="conversation.id" class="inbox-list-item" :class="{ selected: selected?.id === conversation.id }" type="button" @click="selectConversation(conversation)"><strong>{{ conversation.jobTitle }}</strong><span>{{ conversation.offerStatus ? t(`offers.status.${conversation.offerStatus.toLowerCase()}`) : '' }}</span><b v-if="conversation.unreadCount">{{ conversation.unreadCount }}</b></button></aside>
      <div v-if="selected" class="inbox-conversation"><div class="inbox-context"><strong>{{ selected.jobTitle }}</strong><span>{{ t('inbox.context') }} · {{ selected.jobId.slice(0, 8) }}</span></div><div class="inbox-messages"><p v-if="!selected.messages.length" class="job-empty">{{ t('inbox.noMessages') }}</p><article v-for="message in selected.messages" :key="message.id" class="inbox-message"><p>{{ message.content }}</p><small>{{ new Date(message.createdAt).toLocaleString() }}</small></article></div><form class="inbox-form" @submit.prevent="send"><input v-model="input" maxlength="4000" :placeholder="t('inbox.placeholder')"><button class="header-cta" type="submit" :disabled="sending">{{ t('inbox.send') }}</button></form><p v-if="error" class="job-message inbox-error">{{ error }}</p></div><p v-else class="job-empty">{{ t('inbox.choose') }}</p>
    </div>
  </section>
</template>
