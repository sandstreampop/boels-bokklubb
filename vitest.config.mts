// Machine-level tests (tests/*.test.ts), run by `npm test` and by check.yml. Node only, no React
// Native: the tests mock every module that touches a device, and exercise the XState machines in
// lib/machines/ the way the screens do, with events.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
