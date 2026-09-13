<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './components/AppHeader.vue'
import CustomerJobsPanel from './components/CustomerJobsPanel.vue'
import CustomerOffersPanel from './components/CustomerOffersPanel.vue'
import ProviderOffersPanel from './components/ProviderOffersPanel.vue'
import ChatWidget from './components/ChatWidget.vue'
import InboxPanel from './components/InboxPanel.vue'
import ProviderProfilePanel from './components/ProviderProfilePanel.vue'
import SearchView from './components/SearchView.vue'
import ProviderDetailView from './components/ProviderDetailView.vue'
import JobDetailView from './components/JobDetailView.vue'
import AppFooter from './components/AppFooter.vue'
import { useAuth } from './auth/keycloak'
import { register } from './auth/keycloak'
import heroImage from '../file_00000000f89881f4b0b5376aeda919f8.png'
import { setLocale, type Locale } from './i18n'

interface CategoryNode { slug: string; icon: string | null; sortOrder: number; translations: Record<string, { name: string; description: string | null }>; children: CategoryNode[] }
const { t, locale } = useI18n()
const { authenticated, hasRole } = useAuth()
const currentLocale = computed(() => locale.value as Locale)
const categories = ref<CategoryNode[]>([])
interface PublicProvider { userId: string; displayName: string; profileImageRef: string | null; city: string; postalCode: string; availabilityStatus: string; yearsExperience: number; startingPrice: number | null; currency: string; services: { id: string; slug: string; translations: Record<string, { name: string }> }[]; rating: number | null; contactAvailable: boolean }
const providers = ref<PublicProvider[]>([])
const routePath = ref(window.location.pathname)
const searchQuery = ref(''); const searchCity = ref('')
const popularItems = ['cleaning', 'electrician', 'gardening', 'moving', 'painter', 'car'] as const
const stepSymbols = ['⌕', '♧', '♡', '✓']
const categoryAccents = ['mint', 'orange', 'green', 'blue', 'red', 'blue', 'pink', 'yellow', 'blue', 'purple', 'orange', 'slate']
function changeLocale(next: Locale) { setLocale(next) }
function localizedLine(key: string, index: number) { return t(key).split('\n')[index] }
function categoryName(category: CategoryNode) { return category.translations[currentLocale.value]?.name || category.translations.en?.name || Object.values(category.translations).find((translation) => translation.name)?.name || category.slug }
function goSearch(nextQuery = searchQuery.value, nextCity = searchCity.value) { const params = new URLSearchParams(); if (nextQuery.trim()) params.set('q', nextQuery.trim()); if (nextCity.trim()) params.set('city', nextCity.trim()); window.history.pushState({}, '', `/search${params.toString() ? `?${params}` : ''}`); routePath.value = '/search' }
function routeChanged() { routePath.value = window.location.pathname }
onMounted(async () => { const response = await fetch('/api/v1/categories/homepage'); if (!response.ok) return; const payload = await response.json() as { data: CategoryNode[] }; categories.value = payload.data })
onMounted(async () => { const response = await fetch('/api/v1/providers/homepage'); if (response.ok) providers.value = (await response.json() as { data: PublicProvider[] }).data })
onMounted(() => window.addEventListener('popstate', routeChanged))
onUnmounted(() => window.removeEventListener('popstate', routeChanged))
</script>

<template>
  <div class="page-shell">
    <AppHeader :locale="currentLocale" @change-locale="changeLocale" />
    <main v-if="routePath === '/'">
      <section class="hero-section"><div class="hero-media" :style="{ backgroundImage: `url(${heroImage})` }" aria-hidden="true" /><div class="hero-shade" /><div class="container hero-inner"><div class="hero-copy"><span class="free-badge">{{ t('hero.free') }}</span><h1>{{ t('hero.title') }}</h1><p>{{ t('hero.subtitle') }}</p><form class="search-box" @submit.prevent="goSearch()"><div class="search-field"><span class="search-icon">⌕</span><div><input v-model="searchQuery" :placeholder="t('hero.servicePlaceholder')" maxlength="120"><small>{{ t('hero.serviceHint') }}</small></div></div><div class="search-separator" /><div class="search-field location"><span class="search-icon">⌖</span><div><input v-model="searchCity" :placeholder="t('hero.location')" maxlength="120"><small>{{ t('hero.locationHint') }}</small></div></div><button class="search-submit" type="submit">⌕ <span>{{ t('hero.findProviders') }}<br><small>{{ t('hero.findProviders') }}</small></span></button></form><div class="popular"><span>{{ t('hero.popular') }}</span><button v-for="item in popularItems" :key="item" type="button" @click="goSearch(t(`hero.popularItems.${item}`), '')">{{ t(`hero.popularItems.${item}`) }}</button></div></div><aside class="hero-aside"><div class="benefit-card"><strong>{{ localizedLine('hero.benefitTitle', 0) }}<br>{{ localizedLine('hero.benefitTitle', 1) }}</strong><p>{{ t('hero.benefitSubtitle') }}</p><div class="benefit-line"><span>✓</span> {{ t('hero.verifiedProfiles') }}</div><div class="benefit-line"><span>★</span> {{ t('hero.realReviews') }}</div><div class="benefit-line"><span>▢</span> {{ t('hero.directContact') }}</div><div class="benefit-line"><span>●</span> {{ t('hero.nearby') }}</div></div><div class="review-card"><strong>{{ localizedLine('hero.review', 0) }}<br>{{ localizedLine('hero.review', 1) }}</strong><span>★★★★★ &nbsp; – {{ t('hero.reviewAuthor') }}</span></div></aside></div></section>
      <section id="services" class="content-section container"><div class="section-heading"><div><h2>{{ t('categories.title') }}</h2><p>{{ t('categories.description') }}</p></div><a href="/search?kind=categories">{{ t('categories.showAll') }} <span>→</span></a></div><div class="category-grid"><a v-for="category in categories" :key="category.slug" :href="`/services/${category.slug}`" class="category-card"><div class="category-icon" :class="`icon-${categoryAccents[(category.sortOrder / 10) - 1]}`">{{ category.icon }}</div><div><h3>{{ categoryName(category) }}</h3><p>{{ category.translations[currentLocale]?.description || category.translations.en?.description || '' }}</p></div></a></div></section>
      <section id="providers" class="content-section providers-section container"><div class="section-heading"><div><h2>{{ t('providers.title') }}</h2><p>{{ t('providers.description') }}</p></div><a href="/search?kind=providers">{{ t('providers.showAll') }} <span>→</span></a></div><div class="provider-grid"><a v-for="(provider, index) in providers" :key="provider.userId" :href="`/providers/${provider.userId}`" class="provider-card"><div class="provider-photo" :class="`provider-${['mint','blue','green','peach'][index % 4]}`" :style="provider.profileImageRef ? { backgroundImage: `url(${provider.profileImageRef})` } : { backgroundImage: `url(${heroImage})` }"><span>{{ provider.displayName.slice(0, 2).toUpperCase() }}</span><i :class="{ offline: provider.availabilityStatus !== 'AVAILABLE' }">{{ provider.availabilityStatus === 'AVAILABLE' ? `● ${t('providers.online')}` : `● ${t('providers.availableToday')}` }}</i></div><div class="provider-body"><div class="provider-name-row"><div><h3>{{ provider.displayName }}</h3></div></div><div class="provider-rating">★ {{ provider.rating ?? t('providers.ratingPending') }} <span>{{ t('providers.ratingPlaceholder') }}</span></div><div class="provider-details"><span>⌖ {{ provider.city }} · {{ provider.postalCode }}</span></div><div class="provider-tags"><span v-for="service in provider.services.slice(0, 2)" :key="service.id">{{ service.translations[currentLocale]?.name || service.translations.en?.name || service.slug }}</span></div><div class="provider-footer"><strong>{{ provider.startingPrice === null ? t('providers.priceOnRequest') : `${provider.startingPrice} ${provider.currency}` }}</strong><span>{{ t('providers.profile') }}</span></div></div></a></div></section>
      <ProviderProfilePanel v-if="authenticated && hasRole('PROVIDER')" />
      <CustomerJobsPanel v-if="authenticated && hasRole('CUSTOMER')" />
      <CustomerOffersPanel v-if="authenticated && hasRole('CUSTOMER')" />
      <ProviderOffersPanel v-if="authenticated && hasRole('PROVIDER')" />
      <InboxPanel v-if="authenticated && (hasRole('CUSTOMER') || hasRole('PROVIDER'))" />
      <section id="how" class="steps-section"><div class="container"><div class="section-heading centered"><div><span class="section-kicker">{{ t('steps.kicker') }}</span><h2>{{ t('steps.title') }}</h2><p>{{ t('steps.description') }}</p></div></div><div class="steps-grid"><article v-for="(symbol, index) in stepSymbols" :key="symbol" class="step"><span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span><div class="step-symbol">{{ symbol }}</div><h3>{{ t(`steps.items.${index}.title`) }}</h3><strong>{{ t(`steps.items.${index}.accent`) }}</strong><p>{{ t(`steps.items.${index}.description`) }}</p></article></div></div></section>
      <section id="about" class="cta-section container"><div class="cta-mark">✦</div><div><span class="section-kicker">{{ t('cta.kicker') }}</span><h2>{{ t('cta.title') }}</h2><p>{{ t('cta.description') }}</p></div><button class="cta-button" type="button" @click="register">{{ t('cta.register') }} <span>→</span></button></section>
    </main>
    <SearchView v-else-if="routePath === '/search' || routePath.startsWith('/services/')" :initial-category="routePath.startsWith('/services/') ? routePath.slice('/services/'.length) : null" />
    <ProviderDetailView v-else-if="routePath.startsWith('/providers/')" :id="routePath.slice('/providers/'.length)" />
    <JobDetailView v-else-if="routePath.startsWith('/jobs/')" :id="routePath.slice('/jobs/'.length)" />
    <SearchView v-else />
    <ChatWidget />
    <AppFooter />
  </div>
</template>