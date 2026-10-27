// Runs the built app (next start) wired to the fake Steam and Discord in mock-services.mjs,
// for the end-to-end test:   npm run build && node e2e/serve.mjs   (then npm run e2e)

import { spawn } from 'node:child_process'
import { MOCK_PORT, startMock } from './mock-services.mjs'

await startMock()
const mock = `http://localhost:${MOCK_PORT}`
console.log(`[mock] Steam and Discord stand-ins on ${mock}`)

const app = spawn('npx', ['next', 'start', '-p', process.env.PORT ?? '3000'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    STEAM_OPENID_URL: `${mock}/openid/login`,
    STEAM_API_BASE: mock,
    STEAM_WEB_API_KEY: 'test-key',
    DISCORD_AUTHORIZE_URL: `${mock}/discord/authorize`,
    DISCORD_API_BASE: `${mock}/discord/api`,
    DISCORD_CLIENT_ID: 'test-client',
    DISCORD_CLIENT_SECRET: 'test-secret',
  },
})
const stop = () => app.kill('SIGTERM')
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
app.on('exit', (code) => process.exit(code ?? 0))
