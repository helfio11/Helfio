import { createApp } from 'vue'
import './style.css'
import './mobile.css'
import App from './App.vue'
import { i18n } from './i18n'
import { initializeAuth } from './auth/keycloak'

void initializeAuth()
createApp(App).use(i18n).mount('#app')
