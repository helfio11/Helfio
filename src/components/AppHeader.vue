<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supportedLocales, type Locale } from '../i18n'
import { accountManagement, getAccessToken, login, logout, register, useAuth } from '../auth/keycloak'

defineProps<{ locale: Locale }>()
const emit = defineEmits<{ (e: 'change-locale', value: Locale): void }>()
const { t } = useI18n()
const { authenticated, account, loading, hasRole } = useAuth()
const menuOpen = ref(false)
const languageOpen = ref(false)
const languageMenu = ref<HTMLElement | null>(null)
const unreadCount = ref(0)
const notificationUnreadCount = ref(0)
async function refreshUnread() {
	if (!authenticated.value) return
	const token = await getAccessToken(); if (!token) return
	const headers = { authorization: `Bearer ${token}` }
	const inboxResponse = await fetch('/api/v1/inbox/unread', { headers })
	if (inboxResponse.ok) unreadCount.value = ((await inboxResponse.json()) as { data: { count: number } }).data.count
	const notificationResponse = await fetch('/api/v1/notifications', { headers })
	if (notificationResponse.ok) notificationUnreadCount.value = ((await notificationResponse.json()) as { data: { unreadCount: number } }).data.unreadCount
}
function refreshFromEvent() { void refreshUnread() }
function closeLanguageOnOutsidePress(event: PointerEvent) { if (languageMenu.value && !languageMenu.value.contains(event.target as Node)) languageOpen.value = false }
function selectLocale(nextLocale: Locale) { emit('change-locale', nextLocale); languageOpen.value = false }
onMounted(() => { void refreshUnread(); window.addEventListener('inbox-updated', refreshFromEvent); window.addEventListener('notifications-updated', refreshFromEvent); document.addEventListener('pointerdown', closeLanguageOnOutsidePress) })
onUnmounted(() => window.removeEventListener('inbox-updated', refreshFromEvent))
onUnmounted(() => window.removeEventListener('notifications-updated', refreshFromEvent))
onUnmounted(() => document.removeEventListener('pointerdown', closeLanguageOnOutsidePress))
</script>
<template>
	<header class="topbar">
		<div class="container topbar-inner">
			<a class="brand" href="/" @click="menuOpen = false"><span class="brand-mark">⌂</span><span><strong>Helfio</strong><small>{{ t('brandTagline') }}</small></span></a>
			<div ref="languageMenu" class="header-actions">
				<span class="header-language-icon">◉</span>
				<div class="language-menu"><button class="language-trigger" type="button" :aria-expanded="languageOpen" aria-haspopup="listbox" @click="languageOpen = !languageOpen">{{ locale.toUpperCase() }} <span>⌄</span></button><div class="language-options" :class="{ open: languageOpen }" role="listbox"><button v-for="supportedLocale in supportedLocales" :key="supportedLocale" class="language" :class="{ active: locale === supportedLocale }" type="button" role="option" :aria-selected="locale === supportedLocale" @click="selectLocale(supportedLocale)">{{ supportedLocale.toUpperCase() }}</button></div></div>
				<span class="language-chevron">⌄</span>
				<template v-if="!loading && authenticated">
					<button class="login" type="button" :title="t('auth.account')" @click="accountManagement">{{ account?.displayName || account?.email || t('auth.account') }}</button>
					<a class="inbox-link" href="/#inbox">{{ t('inbox.title') }}<b v-if="unreadCount">{{ unreadCount }}</b></a>
					<a class="notifications-link" href="/#notifications">{{ t('notifications.title') }}<b v-if="notificationUnreadCount">{{ notificationUnreadCount }}</b></a>
					<a v-if="hasRole('ADMIN')" class="header-admin-link" href="/admin">{{ t('admin.workspace') }}</a>
					<button class="header-cta" type="button" @click="logout">{{ t('auth.logout') }}</button>
				</template>
				<template v-else-if="!loading"><button class="login" type="button" @click="login">{{ t('auth.login') }}</button><button class="header-cta" type="button" @click="register">{{ t('auth.register') }}</button></template>
			</div>
			<button class="menu-toggle" type="button" :aria-expanded="menuOpen" :aria-label="menuOpen ? 'Close menu' : 'Open menu'" @click="menuOpen = !menuOpen"><span /><span /><span /></button>
			<nav :class="{ open: menuOpen }"><a href="/search?kind=categories" @click="menuOpen = false">{{ t('nav.services') }}</a><a href="/search?kind=jobs" @click="menuOpen = false">{{ t('nav.customers') }}</a><a href="/search?kind=providers" @click="menuOpen = false">{{ t('nav.providers') }}</a><a href="/#about" @click="menuOpen = false">{{ t('nav.about') }}</a><a href="/search" @click="menuOpen = false">{{ t('nav.help') }}</a><template v-if="!loading && authenticated"><button class="mobile-auth-action" type="button" @click="accountManagement(); menuOpen = false">{{ account?.displayName || account?.email || t('auth.account') }}</button><a href="/#inbox" @click="menuOpen = false">{{ t('inbox.title') }}</a><button class="mobile-auth-action" type="button" @click="logout(); menuOpen = false">{{ t('auth.logout') }}</button></template><template v-else-if="!loading"><button class="mobile-auth-action" type="button" @click="login(); menuOpen = false">{{ t('auth.login') }}</button><button class="mobile-auth-action" type="button" @click="register(); menuOpen = false">{{ t('auth.register') }}</button></template></nav>
		</div>
	</header>
</template>
