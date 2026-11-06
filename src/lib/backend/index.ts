import { demo } from './demo'
import { live } from './live'
import type { Backend } from './types'

/** Demo until the real infrastructure is ready: set VITE_RHEMLO_BACKEND=live to switch. */
export const api: Backend = import.meta.env.VITE_RHEMLO_BACKEND === 'live' ? live : demo
export const isDemo = api.mode === 'demo'
export type * from './types'
import { demoSocial, liveSocial, type Social } from './social'
export const social: Social = import.meta.env.VITE_RHEMLO_BACKEND === 'live' ? liveSocial : demoSocial
export type * from './social'
