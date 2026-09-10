<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Locale } from '../i18n'
import { accountManagement, login, logout, register, useAuth } from '../auth/keycloak'

defineProps<{ locale: Locale }>()
const emit = defineEmits<{ (e: 'change-locale', value: Locale): void }>()
const { t } = useI18n()
const { authenticated, account, loading } = useAuth()
</script>
<template>
	<header class="topbar"><div class="container topbar-inner"><a class="brand" href="#"><span class="brand-mark">⌂</span><span><strong>Helfio</strong><small>{{ t('brandTagline') }}</small></span></a><nav><a href="#services">{{ t('nav.services') }}</a><a href="#providers">{{ t('nav.customers') }}</a><a href="#how">{{ t('nav.providers') }}</a><a href="#about">{{ t('nav.about') }}</a><a href="#help">{{ t('nav.help') }}</a></nav><div class="header-actions"><span>◉</span><button v-for="supportedLocale in ['en', 'de', 'sq', 'tr']" :key="supportedLocale" class="language" :class="{ active: locale === supportedLocale }" type="button" @click="emit('change-locale', supportedLocale as Locale)">{{ supportedLocale.toUpperCase() }}</button><span>⌄</span><template v-if="!loading && authenticated"><button class="login" type="button" :title="t('auth.account')" @click="accountManagement">{{ account?.displayName || account?.email || t('auth.account') }}</button><button class="header-cta" type="button" @click="logout">{{ t('auth.logout') }}</button></template><template v-else-if="!loading"><button class="login" type="button" @click="login">{{ t('auth.login') }}</button><button class="header-cta" type="button" @click="register">{{ t('auth.register') }}</button></template></div></div></header>
</template>
