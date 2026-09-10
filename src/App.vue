<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './components/AppHeader.vue'
import heroImage from '../file_00000000f89881f4b0b5376aeda919f8.png'
import { setLocale, type Locale } from './i18n'

interface CategoryNode { slug: string; icon: string | null; sortOrder: number; translations: Record<string, { name: string; description: string | null }>; children: CategoryNode[] }
const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value as Locale)
const categories = ref<CategoryNode[]>([])
const providers = [
  { key: 'cleanTeam', name: 'CleanTeam', location: 'Ravensburg · 2 km', rating: '4.9', reviews: '124', initials: 'CT', tone: 'provider-mint', online: true },
  { key: 'mueller', name: 'Müller Handwerk', location: 'Weingarten · 5 km', rating: '4.8', reviews: '98', initials: 'MH', tone: 'provider-blue', online: false },
  { key: 'greenPartner', name: 'GrünPartner', location: 'Ravensburg · 3 km', rating: '4.9', reviews: '76', initials: 'GP', tone: 'provider-green', online: true },
  { key: 'schnellUmzug', name: 'SchnellUmzug', location: 'Friedrichshafen · 12 km', rating: '4.7', reviews: '62', initials: 'SU', tone: 'provider-peach', online: true },
] as const
const popularItems = ['cleaning', 'electrician', 'gardening', 'moving', 'painter', 'car'] as const
const stepSymbols = ['⌕', '♧', '♡', '✓']
const categoryAccents = ['mint', 'orange', 'green', 'blue', 'red', 'blue', 'pink', 'yellow', 'blue', 'purple', 'orange', 'slate']
function changeLocale(next: Locale) { setLocale(next) }
function localizedLine(key: string, index: number) { return t(key).split('\n')[index] }
function categoryName(category: CategoryNode) { return category.translations[currentLocale.value]?.name || category.translations.en?.name || Object.values(category.translations).find((translation) => translation.name)?.name || category.slug }
onMounted(async () => { const response = await fetch('/api/v1/categories/homepage'); if (!response.ok) return; const payload = await response.json() as { data: CategoryNode[] }; categories.value = payload.data })
</script>

<template>
  <div class="page-shell">
    <AppHeader :locale="currentLocale" @change-locale="changeLocale" />
    <main>
      <section class="hero-section"><div class="hero-media" :style="{ backgroundImage: `url(${heroImage})` }" aria-hidden="true" /><div class="hero-shade" /><div class="container hero-inner"><div class="hero-copy"><span class="free-badge">{{ t('hero.free') }}</span><h1>{{ t('hero.title') }}<br><em>{{ t('hero.title') }}</em></h1><p>{{ t('hero.subtitle') }}</p><div class="search-box"><div class="search-field"><span class="search-icon">⌕</span><div><strong>{{ t('hero.servicePlaceholder') }}</strong><small>{{ t('hero.serviceHint') }}</small></div></div><div class="search-separator" /><div class="search-field location"><span class="search-icon">⌖</span><div><strong>{{ t('hero.location') }}</strong><small>{{ t('hero.locationHint') }}</small></div></div><button class="search-submit" type="button">⌕ <span>{{ t('hero.findProviders') }}<br><small>{{ t('hero.findProviders') }}</small></span></button></div><div class="popular"><span>{{ t('hero.popular') }}</span><button v-for="item in popularItems" :key="item" type="button">{{ t(`hero.popularItems.${item}`) }}</button></div></div><aside class="hero-aside"><div class="benefit-card"><strong>{{ localizedLine('hero.benefitTitle', 0) }}<br>{{ localizedLine('hero.benefitTitle', 1) }}</strong><p>{{ t('hero.benefitSubtitle') }}</p><div class="benefit-line"><span>✓</span> {{ t('hero.verifiedProfiles') }}</div><div class="benefit-line"><span>★</span> {{ t('hero.realReviews') }}</div><div class="benefit-line"><span>▢</span> {{ t('hero.directContact') }}</div><div class="benefit-line"><span>●</span> {{ t('hero.nearby') }}</div></div><div class="review-card"><strong>{{ localizedLine('hero.review', 0) }}<br>{{ localizedLine('hero.review', 1) }}</strong><span>★★★★★ &nbsp; – {{ t('hero.reviewAuthor') }}</span></div></aside></div></section>
      <section class="content-section container"><div class="section-heading"><div><h2>{{ t('categories.title') }}</h2><p>{{ t('categories.description') }}</p></div><a href="#">{{ t('categories.showAll') }} <span>→</span></a></div><div class="category-grid"><article v-for="category in categories" :key="category.slug" class="category-card"><div class="category-icon" :class="`icon-${categoryAccents[(category.sortOrder / 10) - 1]}`">{{ category.icon }}</div><div><h3>{{ categoryName(category) }}</h3><p>{{ category.translations[currentLocale]?.description || category.translations.en?.description || '' }}</p></div></article></div></section>
      <section class="content-section providers-section container"><div class="section-heading"><div><h2>{{ t('providers.title') }}</h2><p>{{ t('providers.description') }}</p></div><a href="#">{{ t('providers.showAll') }} <span>→</span></a></div><div class="provider-grid"><article v-for="provider in providers" :key="provider.name" class="provider-card"><div class="provider-photo" :class="provider.tone" :style="{ backgroundImage: `url(${heroImage})` }"><span>{{ provider.initials }}</span><i :class="{ offline: !provider.online }">{{ provider.online ? `● ${t('providers.online')}` : `● ${t('providers.availableToday')}` }}</i><button type="button" :aria-label="t('providers.favorite')">♡</button></div><div class="provider-body"><div class="provider-name-row"><div><h3>{{ provider.name }}</h3></div></div><div class="provider-rating">★ {{ provider.rating }} <span>({{ provider.reviews }} {{ t('providers.reviews') }})</span></div><div class="provider-details"><span>⌖ {{ provider.location }}</span></div><div class="provider-tags"><span v-for="tag in 2" :key="tag">{{ t(`providers.items.${provider.key}.tags.${tag - 1}`) }}</span></div><div class="provider-footer"><strong>{{ t(`providers.items.${provider.key}.price`) }}</strong><button type="button">{{ t('providers.profile') }}</button></div></div></article></div></section>
      <section class="steps-section"><div class="container"><div class="section-heading centered"><div><span class="section-kicker">{{ t('steps.kicker') }}</span><h2>{{ t('steps.title') }}</h2><p>{{ t('steps.description') }}</p></div></div><div class="steps-grid"><article v-for="(symbol, index) in stepSymbols" :key="symbol" class="step"><span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span><div class="step-symbol">{{ symbol }}</div><h3>{{ t(`steps.items.${index}.title`) }}</h3><strong>{{ t(`steps.items.${index}.accent`) }}</strong><p>{{ t(`steps.items.${index}.description`) }}</p></article></div></div></section>
      <section class="cta-section container"><div class="cta-mark">✦</div><div><span class="section-kicker">{{ t('cta.kicker') }}</span><h2>{{ t('cta.title') }}</h2><p>{{ t('cta.description') }}</p></div><button class="cta-button" type="button">{{ t('cta.register') }} <span>→</span></button></section>
    </main>
  </div>
</template>