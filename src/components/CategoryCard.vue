<script setup lang="ts">
export interface CategoryItem {
  name: string
  description: string
  count: string
  icon: string
  accent: string
}

defineProps<{ category: CategoryItem }>()
</script>

<template>
  <article class="category-card">
    <div class="category-icon" :style="{ background: category.accent }">{{ category.icon }}</div>
    <div class="category-content">
      <h3>{{ category.name }}</h3>
      <p>{{ category.description }}</p>
    </div>
    <div class="category-meta">
      <span>{{ category.count }}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M7.5 5.5 12.5 10l-5 4.5" />
      </svg>
    </div>
  </article>
</template>
