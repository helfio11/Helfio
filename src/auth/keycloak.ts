import Keycloak from 'keycloak-js'
import { computed, reactive, readonly } from 'vue'
import { setLocale, type Locale } from '../i18n'
import { applicationRoles, type ApplicationRole } from './roles'

export interface HelfioAccount {
  id: string
  keycloakSubjectId: string
  email: string | null
  displayName: string | null
  preferredLocale: Locale
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
  roles: ApplicationRole[]
}

const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'helfio-web'
function browserKeycloakUrl() {
  const configured = import.meta.env.VITE_KEYCLOAK_PUBLIC_URL
  if (configured) return configured.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const codespacesHost = window.location.hostname.match(/^(.*)-5173\.(.+)$/)
    if (codespacesHost) return `https://${codespacesHost[1]}-8080.${codespacesHost[2]}`
  }
  return import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080'
}

const keycloak = new Keycloak({
  url: browserKeycloakUrl(),
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'helfio',
  clientId,
})
const state = reactive({ initialized: false, loading: true, authenticated: false, account: null as HelfioAccount | null, error: null as string | null })
let initialization: Promise<void> | null = null

function updateState() {
  state.authenticated = keycloak.authenticated === true
  state.account = null
}

async function loadAccount() {
  if (!keycloak.authenticated) return
  try {
    const token = await getAccessToken()
    const response = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } })
    if (response.ok) {
      const payload = await response.json() as { data: HelfioAccount }
      state.account = payload.data
      setLocale(payload.data.preferredLocale)
    }
  } catch {
    state.error = 'account_unavailable'
  }
}

export function initializeAuth() {
  if (initialization) return initialization
  initialization = keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    checkLoginIframe: false,
    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
  }).then(async () => {
    state.initialized = true
    updateState()
    await loadAccount()
  }).catch(() => {
    state.initialized = true
    state.error = 'keycloak_unavailable'
    updateState()
  }).finally(() => {
    state.loading = false
  })
  keycloak.onAuthSuccess = () => { updateState(); void loadAccount() }
  keycloak.onAuthLogout = updateState
  keycloak.onTokenExpired = () => { void keycloak.updateToken(30).catch(() => keycloak.logout()) }
  return initialization
}

export async function getAccessToken() {
  if (!keycloak.authenticated) return null
  await keycloak.updateToken(30)
  return keycloak.token ?? null
}

export function login() { return keycloak.login({ redirectUri: window.location.href }) }
export function register() { return keycloak.register({ redirectUri: window.location.href }) }
export function forgotPassword() { return keycloak.login({ action: 'UPDATE_PASSWORD', redirectUri: window.location.href }) }
export function accountManagement() { return keycloak.accountManagement() }
export function logout() { return keycloak.logout({ redirectUri: window.location.origin }) }

export function useAuth() {
  const roles = computed(() => {
    const realmRoles = keycloak.realmAccess?.roles ?? []
    const clientRoles = keycloak.resourceAccess?.[clientId]?.roles ?? []
    return applicationRoles.filter((role) => [...realmRoles, ...clientRoles].includes(role))
  })
  return { state: readonly(state), loading: computed(() => state.loading), authenticated: computed(() => state.authenticated), account: computed(() => state.account), roles, hasRole: (role: ApplicationRole) => roles.value.includes(role) }
}