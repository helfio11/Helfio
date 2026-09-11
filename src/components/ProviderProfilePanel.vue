<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAccessToken } from '../auth/keycloak'
import type { Locale } from '../i18n'

interface CategoryNode { id: string; slug: string; icon: string | null; translations: Record<string, { name: string; description: string | null }>; children: CategoryNode[] }
interface ProviderProfile { displayName: string; description: string; profileImageRef: string | null; phone: string | null; contactEmail: string | null; city: string; postalCode: string; serviceRadiusKm: number; availabilityStatus: string; yearsExperience: number; startingPrice: number | null; currency: string; visibility: string; services: { id: string }[] }

const { t, locale } = useI18n()
const categories = ref<CategoryNode[]>([])
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const selectedServices = ref<string[]>([])
const form = reactive({ displayName: '', description: '', profileImageRef: '', phone: '', contactEmail: '', city: '', postalCode: '', serviceRadiusKm: 10, availabilityStatus: 'AVAILABLE', yearsExperience: 0, startingPrice: null as number | null, currency: 'EUR', visibility: 'PRIVATE' })

function categoryLabel(category: CategoryNode) {
  return category.translations[locale.value as Locale]?.name || category.translations.en?.name || category.slug
}

function flatten(items: CategoryNode[]): CategoryNode[] { return items.flatMap((item) => [item, ...flatten(item.children)]) }

async function request(path: string, init?: RequestInit) {
  const token = await getAccessToken()
  return fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } })
}

onMounted(async () => {
  const [categoryResponse, profileResponse] = await Promise.all([fetch('/api/v1/categories/tree'), request('/api/v1/provider/profile')])
  if (categoryResponse.ok) categories.value = flatten((await categoryResponse.json() as { data: CategoryNode[] }).data)
  if (profileResponse.ok) {
    const profile = (await profileResponse.json() as { data: ProviderProfile | null }).data
    if (profile) {
      Object.assign(form, { ...profile, profileImageRef: profile.profileImageRef ?? '', phone: profile.phone ?? '', contactEmail: profile.contactEmail ?? '' })
      selectedServices.value = profile.services.map((service) => service.id)
    }
  }
  loading.value = false
})

async function save() {
  saving.value = true
  message.value = ''
  const profileResponse = await request('/api/v1/provider/profile', { method: 'PUT', body: JSON.stringify(form) })
  if (!profileResponse.ok) { message.value = t('providerProfile.saveError'); saving.value = false; return }
  const serviceResponse = await request('/api/v1/provider/services', { method: 'PUT', body: JSON.stringify({ categoryIds: selectedServices.value }) })
  message.value = serviceResponse.ok ? t('providerProfile.saved') : t('providerProfile.serviceError')
  saving.value = false
}
</script>

<template>
  <section class="content-section container provider-profile-panel">
    <div class="section-heading"><div><span class="section-kicker">{{ t('providerProfile.kicker') }}</span><h2>{{ t('providerProfile.title') }}</h2><p>{{ t('providerProfile.description') }}</p></div></div>
    <form v-if="!loading" class="provider-profile-form" @submit.prevent="save">
      <label>{{ t('providerProfile.name') }}<input v-model="form.displayName" required maxlength="160"></label>
      <label>{{ t('providerProfile.about') }}<textarea v-model="form.description" maxlength="4000" rows="3" /></label>
      <div class="provider-profile-fields"><label>{{ t('providerProfile.city') }}<input v-model="form.city" required maxlength="120"></label><label>{{ t('providerProfile.postalCode') }}<input v-model="form.postalCode" required maxlength="20"></label><label>{{ t('providerProfile.radius') }}<input v-model.number="form.serviceRadiusKm" type="number" min="0" max="1000"></label><label>{{ t('providerProfile.experience') }}<input v-model.number="form.yearsExperience" type="number" min="0" max="100"></label><label>{{ t('providerProfile.startingPrice') }}<input v-model.number="form.startingPrice" type="number" min="0" step="0.01"></label><label>{{ t('providerProfile.availability') }}<select v-model="form.availabilityStatus"><option value="AVAILABLE">{{ t('providerProfile.available') }}</option><option value="BUSY">{{ t('providerProfile.busy') }}</option><option value="UNAVAILABLE">{{ t('providerProfile.unavailable') }}</option></select></label></div>
      <label>{{ t('providerProfile.services') }}</label><div class="provider-service-options"><label v-for="category in categories" :key="category.id"><input v-model="selectedServices" type="checkbox" :value="category.id"> {{ categoryLabel(category) }}</label></div>
      <label class="provider-profile-visibility"><input v-model="form.visibility" type="checkbox" true-value="PUBLIC" false-value="PRIVATE"> {{ t('providerProfile.publicProfile') }}</label>
      <button class="header-cta" type="submit" :disabled="saving">{{ saving ? t('providerProfile.saving') : t('providerProfile.save') }}</button><span v-if="message" class="provider-profile-message">{{ message }}</span>
    </form>
  </section>
</template>