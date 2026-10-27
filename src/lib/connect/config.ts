import 'server-only'

// Addresses of Steam and Discord. Local tests point these at a fake server (e2e/mock-services.mjs);
// on Vercel the overrides are ignored, so production always talks to the real services.

const local = (name: string) => (process.env.VERCEL ? undefined : process.env[name] || undefined)

export const steamOpenIdUrl = () => local('STEAM_OPENID_URL') ?? 'https://steamcommunity.com/openid/login'
export const steamApiBase = () => local('STEAM_API_BASE') ?? 'https://api.steampowered.com'
export const steamApiKey = () => process.env.STEAM_WEB_API_KEY?.trim() || null

export const discordAuthorizeUrl = () => local('DISCORD_AUTHORIZE_URL') ?? 'https://discord.com/oauth2/authorize'
export const discordApiBase = () => local('DISCORD_API_BASE') ?? 'https://discord.com/api'
export function discordClient() {
  const id = process.env.DISCORD_CLIENT_ID?.trim()
  const secret = process.env.DISCORD_CLIENT_SECRET?.trim()
  return id && secret ? { id, secret } : null
}
