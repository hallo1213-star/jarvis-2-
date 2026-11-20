import { fal } from './fal.js'
import { replicate } from './replicate.js'
import { demo } from './demo.js'

export const PROVIDERS = { fal, replicate, demo }
export const getProvider = (id) => PROVIDERS[id]
