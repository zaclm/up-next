import type { Locale } from '../config'
import { ar } from './ar'
import { en, type Messages } from './en'
import { fr } from './fr'

export type { Messages }
export const dictionaries: Record<Locale, Messages> = { en, fr, ar }
