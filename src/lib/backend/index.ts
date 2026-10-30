import { demo } from './demo'
import { live } from './live'
import type { Backend } from './types'

/** Demo until the real infrastructure is ready: set VITE_RHEMLO_BACKEND=live to switch. */
export const api: Backend = import.meta.env.VITE_RHEMLO_BACKEND === 'live' ? live : demo
export const isDemo = api.mode === 'demo'
export type * from './types'
