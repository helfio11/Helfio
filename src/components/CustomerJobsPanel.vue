<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAccessToken } from '../auth/keycloak'
import type { Locale } from '../i18n'

interface CategoryNode { id: string; slug: string; translations: Record<string, { name: string; description: string | null }>; children: CategoryNode[] }
interface Job { id: string; categoryId: string; title: string; description: string; city: string; postalCode: string | null; countryCode: string; budgetType: string; budgetMin: number | null; budgetMax: number | null; currency: string; preferredDate: string | null; preferredTimeText: string | null; status: string; category: CategoryNode }

const { t, locale } = useI18n()
const categories = ref<CategoryNode[]>([])
const jobs = ref<Job[]>([])
const selectedId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const form = reactive({ categoryId: '', title: '', description: '', city: '', postalCode: '', countryCode: 'DE', budgetType: 'RANGE', budgetMin: null as number | null, budgetMax: null as number | null, currency: 'EUR', preferredDate: '', preferredTimeText: '' })

function flatten(items: CategoryNode[]): CategoryNode[] { return items.flatMap((item) => [item, ...flatten(item.children)]) }
function categoryLabel(category: CategoryNode) { return category.translations[locale.value as Locale]?.name || category.translations.en?.name || category.slug }
function selectedJob() { return jobs.value.find((job) => job.id === selectedId.value) ?? null }
function editAllowed() { return selectedJob()?.status === 'DRAFT' || selectedJob()?.status === 'OPEN' }
async function api(path: string, init?: RequestInit) {
  const token = await getAccessToken()
  return fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } })
}
async function refresh() {
  const response = await api('/api/v1/jobs')
  if (response.ok) jobs.value = (await response.json() as { data: Job[] }).data
}
function resetForm() {
  selectedId.value = null
  Object.assign(form, { categoryId: categories.value[0]?.id ?? '', title: '', description: '', city: '', postalCode: '', countryCode: 'DE', budgetType: 'RANGE', budgetMin: null, budgetMax: null, currency: 'EUR', preferredDate: '', preferredTimeText: '' })
  message.value = ''
}
function selectJob(job: Job) {
  selectedId.value = job.id
  Object.assign(form, { ...job, postalCode: job.postalCode ?? '', preferredDate: job.preferredDate ?? '', preferredTimeText: job.preferredTimeText ?? '' })
  message.value = ''
}
async function save() {
  saving.value = true
  message.value = ''
  const body = { ...form, postalCode: form.postalCode || null, budgetMin: form.budgetMin ?? null, budgetMax: form.budgetMax ?? null, preferredDate: form.preferredDate || null, preferredTimeText: form.preferredTimeText || null }
  const response = await api(selectedId.value ? `/api/v1/jobs/${selectedId.value}` : '/api/v1/jobs', { method: selectedId.value ? 'PATCH' : 'POST', body: JSON.stringify(body) })
  if (!response.ok) message.value = t('jobs.saveError')
  else { message.value = t('jobs.saved'); await refresh(); if (!selectedId.value) resetForm() }
  saving.value = false
}
async function transition(action: 'publish' | 'cancel') {
  if (!selectedId.value) return
  const response = await api(`/api/v1/jobs/${selectedId.value}/${action}`, { method: 'POST' })
  message.value = response.ok ? t(`jobs.${action === 'publish' ? 'published' : 'cancelled'}`) : t('jobs.transitionError')
  if (response.ok) await refresh()
}
onMounted(async () => {
  const categoryResponse = await fetch('/api/v1/categories/tree')
  if (categoryResponse.ok) categories.value = flatten((await categoryResponse.json() as { data: CategoryNode[] }).data)
  await refresh()
  resetForm()
  loading.value = false
})
</script>

<template>
  <section class="content-section container customer-jobs-panel">
    <div class="section-heading"><div><span class="section-kicker">{{ t('jobs.kicker') }}</span><h2>{{ t('jobs.title') }}</h2><p>{{ t('jobs.description') }}</p></div><button class="header-cta" type="button" @click="resetForm">{{ t('jobs.newRequest') }}</button></div>
    <div v-if="!loading" class="customer-jobs-layout">
      <aside class="job-list"><p v-if="jobs.length === 0" class="job-empty">{{ t('jobs.empty') }}</p><button v-for="job in jobs" :key="job.id" type="button" class="job-list-item" :class="{ selected: selectedId === job.id }" @click="selectJob(job)"><strong>{{ job.title }}</strong><span>{{ categoryLabel(job.category) }} · {{ t(`jobs.status.${job.status.toLowerCase()}`) }}</span><small>{{ job.city }}, {{ job.countryCode }}</small></button></aside>
      <form class="job-form" @submit.prevent="save">
        <div class="job-form-heading"><h3>{{ selectedId ? t('jobs.edit') : t('jobs.create') }}</h3><span v-if="selectedJob()" class="job-status">{{ t(`jobs.status.${selectedJob()?.status.toLowerCase()}`) }}</span></div>
        <label>{{ t('jobs.category') }}<select v-model="form.categoryId" required :disabled="Boolean(selectedId) && !editAllowed()"><option disabled value="">{{ t('jobs.chooseCategory') }}</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ categoryLabel(category) }}</option></select></label>
        <label>{{ t('jobs.titleField') }}<input v-model="form.title" required maxlength="160"></label>
        <label>{{ t('jobs.descriptionField') }}<textarea v-model="form.description" required maxlength="4000" rows="4" /></label>
        <div class="job-fields"><label>{{ t('jobs.city') }}<input v-model="form.city" required maxlength="120"></label><label>{{ t('jobs.postalCode') }}<input v-model="form.postalCode" maxlength="20"></label><label>{{ t('jobs.country') }}<input v-model="form.countryCode" required maxlength="2"></label></div>
        <div class="job-fields"><label>{{ t('jobs.budgetType') }}<select v-model="form.budgetType"><option value="RANGE">{{ t('jobs.range') }}</option><option value="FIXED">{{ t('jobs.fixed') }}</option><option value="NEGOTIABLE">{{ t('jobs.negotiable') }}</option></select></label><label>{{ t('jobs.minimum') }}<input v-model.number="form.budgetMin" type="number" min="0" step="0.01"></label><label>{{ t('jobs.maximum') }}<input v-model.number="form.budgetMax" type="number" min="0" step="0.01"></label><label>{{ t('jobs.currency') }}<select v-model="form.currency"><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option></select></label></div>
        <div class="job-fields"><label>{{ t('jobs.preferredDate') }}<input v-model="form.preferredDate" type="date"></label><label>{{ t('jobs.preferredTime') }}<input v-model="form.preferredTimeText" maxlength="120"></label></div>
        <div class="job-actions"><button class="header-cta" type="submit" :disabled="saving || (Boolean(selectedId) && !editAllowed())">{{ saving ? t('jobs.saving') : t('jobs.saveDraft') }}</button><button v-if="selectedId && selectedJob()?.status === 'DRAFT'" type="button" class="job-secondary" @click="transition('publish')">{{ t('jobs.publish') }}</button><button v-if="selectedId && (selectedJob()?.status === 'DRAFT' || selectedJob()?.status === 'OPEN')" type="button" class="job-danger" @click="transition('cancel')">{{ t('jobs.cancel') }}</button><span v-if="message" class="job-message">{{ message }}</span></div>
      </form>
    </div>
  </section>
</template>
