export const applicationRoles = ['CUSTOMER', 'PROVIDER', 'ADMIN'] as const
export type ApplicationRole = (typeof applicationRoles)[number]