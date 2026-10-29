import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { playgroundAliases } from './vite.config.js';

export default defineConfig({
    resolve: { alias: playgroundAliases },
    test: {
        include: ['tests/browser/*.browser.ts'],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            screenshotFailures: false,
        },
    },
});
