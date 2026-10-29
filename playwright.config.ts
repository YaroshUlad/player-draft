import {existsSync} from 'node:fs';
import {defineConfig} from '@playwright/test';

const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH ?? (existsSync(systemChrome) ? systemChrome : undefined);

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.spec.ts',
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		headless: true,
		launchOptions: {
			...(executablePath ? {executablePath} : {}),
			args: ['--autoplay-policy=no-user-gesture-required']
		}
	}
});
