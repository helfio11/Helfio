import type { IncomingMessage } from 'node:http'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { applicationRoles, isApplicationRole, type ApplicationRole } from './roles.js'

export interface AuthenticatedIdentity {
  subject: string
  email: string | null
  displayName: string | null
  roles: ApplicationRole[]
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthenticatedIdentity>
}

interface KeycloakClaims extends JWTPayload {
  email?: string
  name?: string
  preferred_username?: string
  realm_access?: { roles?: unknown }
  resource_access?: Record<string, { roles?: unknown }>
}

function stringClaim(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function claimsRoles(claims: KeycloakClaims, clientId: string): ApplicationRole[] {
  const realmRoles = Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []
  const clientRoles = Array.isArray(claims.resource_access?.[clientId]?.roles) ? claims.resource_access[clientId].roles : []
  return applicationRoles.filter((role) => [...realmRoles, ...clientRoles].includes(role))
}

export class KeycloakTokenVerifier implements TokenVerifier {
  private readonly keys

  constructor(
    issuer = process.env.KEYCLOAK_ISSUER ?? defaultIssuer(),
    private readonly audience = process.env.KEYCLOAK_AUDIENCE ?? 'helfio-web',
    private readonly clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'helfio-web',
  ) {
    this.issuer = issuer.replace(/\/$/, '')
    this.keys = createRemoteJWKSet(new URL(`${this.issuer}/protocol/openid-connect/certs`))
  }

  private readonly issuer: string

  async verify(token: string): Promise<AuthenticatedIdentity> {
    const { payload } = await jwtVerify<KeycloakClaims>(token, this.keys, {
      issuer: this.issuer,
      audience: this.audience,
    })
    if (!payload.sub) throw new Error('Token has no subject')
    return {
      subject: payload.sub,
      email: stringClaim(payload.email),
      displayName: stringClaim(payload.name) ?? stringClaim(payload.preferred_username),
      roles: claimsRoles(payload, this.clientId),
    }
  }
}

function defaultIssuer() {
  if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${process.env.CODESPACE_NAME}-8080.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/realms/helfio`
  }
  return 'http://localhost:8080/realms/helfio'
}

export function bearerToken(request: IncomingMessage): string | null {
  const value = request.headers.authorization
  if (!value?.startsWith('Bearer ')) return null
  const token = value.slice('Bearer '.length).trim()
  return token || null
}

export async function authenticate(request: IncomingMessage, verifier: TokenVerifier): Promise<AuthenticatedIdentity | null> {
  const token = bearerToken(request)
  if (!token) return null
  try {
    return await verifier.verify(token)
  } catch {
    return null
  }
}

export function hasRole(identity: AuthenticatedIdentity, role: ApplicationRole) {
  return isApplicationRole(role) && identity.roles.includes(role)
}