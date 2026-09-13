<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
interface Job { title: string; description: string; city: string; currency: string; budgetMin: number | null; budgetMax: number | null; category: { translations: Record<string, { name: string }> } }
const props = defineProps<{ id: string }>(); const { t, locale } = useI18n(); const job = ref<Job | null>(null); const loading = ref(true)
onMounted(async () => { const response = await fetch(`/api/v1/jobs/public/${encodeURIComponent(props.id)}`); if (response.ok) job.value = (await response.json() as { data: Job }).data; loading.value = false })
</script>
<template><section class="content-section container job-detail"><p v-if="loading" class="job-empty">{{ t('search.loading') }}</p><p v-else-if="!job" class="job-message">{{ t('search.notFound') }}</p><article v-else class="job-detail-content"><span class="section-kicker">{{ t('search.jobs') }}</span><h2>{{ job.title }}</h2><p>{{ job.description }}</p><p>{{ job.city }} · {{ job.category.translations[locale]?.name || job.category.translations.en?.name }} · {{ job.budgetMin ?? '?' }}–{{ job.budgetMax ?? '?' }} {{ job.currency }}</p><a class="header-cta" href="/search?kind=providers">{{ t('search.providers') }}</a></article></section></template>