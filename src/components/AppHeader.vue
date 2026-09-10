<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Locale } from '../i18n'

defineProps<{ locale: Locale }>()
const emit = defineEmits<{ (e: 'change-locale', value: Locale): void }>()
const { t } = useI18n()
</script>
<template>
	<header class="topbar"><div class="container topbar-inner"><a class="brand" href="#"><span class="brand-mark">⌂</span><span><strong>Helfio</strong><small>{{ t('brandTagline') }}</small></span></a><nav><a href="#services">{{ t('nav.services') }}</a><a href="#providers">{{ t('nav.customers') }}</a><a href="#how">{{ t('nav.providers') }}</a><a href="#about">{{ t('nav.about') }}</a><a href="#help">{{ t('nav.help') }}</a></nav><div class="header-actions"><span>◉</span><button v-for="supportedLocale in ['en', 'de', 'sq', 'tr']" :key="supportedLocale" class="language" :class="{ active: locale === supportedLocale }" type="button" @click="emit('change-locale', supportedLocale as Locale)">{{ supportedLocale.toUpperCase() }}</button><span>⌄</span><button class="login" type="button">{{ t('nav.login') }}</button><button class="header-cta" type="button">{{ t('nav.register') }}</button></div></div></header>
</template>
