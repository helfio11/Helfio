<script setup lang="ts">
export interface ProviderItem {
  name: string
  role: string
  rating: number
  reviews: number
  location: string
  badges: string[]
  price: string
  accent: string
}

defineProps<{ provider: ProviderItem }>()
</script>

<template>
  <article class="provider-card">
    <div class="provider-top">
      <div class="provider-avatar" :style="{ background: provider.accent }">{{ provider.name.charAt(0) }}</div>
      <div class="provider-title">
        <h3>{{ provider.name }}</h3>
        <span>{{ provider.role }}</span>
      </div>
      <div class="provider-rating">
        <span>★</span>
        {{ provider.rating.toFixed(1) }}
      </div>
    </div>

    <div class="provider-meta">
      <span>{{ provider.location }}</span>
      <span>{{ provider.reviews }} Bewertungen</span>
    </div>

    <div class="provider-badges">
      <span v-for="badge in provider.badges" :key="badge">{{ badge }}</span>
    </div>

    <div class="provider-footer">
      <div>
        <small>Ab</small>
        <strong>{{ provider.price }}</strong>
      </div>
      <button type="button">Kontakt</button>
    </div>
  </article>
</template>
