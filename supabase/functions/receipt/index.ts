import { createReceiptHandler } from './handler.mjs'

Deno.serve(createReceiptHandler({
  origin: Deno.env.get('APP_ORIGIN') ?? 'https://yohaku1228.github.io',
  apiKey: Deno.env.get('GEMINI_API_KEY'),
  async isAuthorized(token: string) {
    const owner = Deno.env.get('HOUSEHOLD_OWNER_ID')
    if (!owner || !token || token.length > 4096) return false
    const response = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(5_000),
    })
    return response.ok && (await response.json()).id === owner
  },
  freeTierConfirmed: Deno.env.get('GEMINI_FREE_TIER_CONFIRMED') === 'true',
}))
