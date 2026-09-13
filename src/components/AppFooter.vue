<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const currentYear = new Date().getFullYear()
const { t } = useI18n()
</script>

<template>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <div class="brand-wrap footer-brand">
          <div class="brand-mark">H</div>
          <div class="brand-copy">
            <span class="brand-name">Helfio</span>
            <small class="brand-tag">{{ t('footer.tag') }}</small>
          </div>
        </div>
        <p class="footer-copy">{{ t('footer.description') }}</p>
      </div>

      <div class="footer-links">
        <h4>{{ t('footer.company') }}</h4>
        <a href="/#about">{{ t('footer.about') }}</a>
        <a href="/search?kind=providers">{{ t('footer.careers') }}</a>
        <a href="/search?kind=providers">{{ t('footer.partners') }}</a>
      </div>

      <div class="footer-links">
        <h4>{{ t('footer.service') }}</h4>
        <a href="/search">{{ t('footer.customerService') }}</a>
        <a href="/search">{{ t('footer.help') }}</a>
        <a href="/search?sort=newest">{{ t('footer.reviews') }}</a>
      </div>

      <div class="footer-links">
        <h4>{{ t('footer.legal') }}</h4>
        <a href="/search">{{ t('footer.terms') }}</a>
        <a href="/search">{{ t('footer.privacy') }}</a>
        <a href="/search">{{ t('footer.imprint') }}</a>
      </div>
    </div>

    <div class="container footer-bottom">
      <span>© {{ currentYear }} Helfio</span>
      <span>EN • DE • SQ • TR</span>
    </div>
  </footer>
</template>
