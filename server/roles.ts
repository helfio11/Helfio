export const applicationRoles = ['CUSTOMER', 'PROVIDER', 'ADMIN'] as const
export type ApplicationRole = (typeof applicationRoles)[number]

export function isApplicationRole(value: string): value is ApplicationRole {
  return applicationRoles.includes(value as ApplicationRole)
}