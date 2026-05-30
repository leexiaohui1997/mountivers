import { defineApi, service } from './base'

export const checkHealth = defineApi(() => service.get('/health'))
