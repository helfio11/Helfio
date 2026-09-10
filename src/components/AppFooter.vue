<script setup lang="ts">
const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <div class="brand-wrap footer-brand">
          <div class="brand-mark">H</div>
          <div class="brand-copy">
            <span class="brand-name">Helfio</span>
            <small class="brand-tag">Marketplace</small>
          </div>
        </div>
        <p class="footer-copy">Professionelle Dienstleistungen für Zuhause, Projekte und Alltag.</p>
      </div>

      <div class="footer-links">
        <h4>Unternehmen</h4>
        <a href="#">Über uns</a>
        <a href="#">Karriere</a>
        <a href="#">Partner</a>
      </div>

      <div class="footer-links">
        <h4>Service</h4>
        <a href="#">Kundenservice</a>
        <a href="#">Hilfe</a>
        <a href="#">Bewertungen</a>
      </div>

      <div class="footer-links">
        <h4>Rechtliches</h4>
        <a href="#">AGB</a>
        <a href="#">Datenschutz</a>
        <a href="#">Impressum</a>
      </div>
    </div>

    <div class="container footer-bottom">
      <span>© {{ currentYear }} Helfio</span>
      <span>Deutsch • Shqip</span>
    </div>
  </footer>
</template>
