import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		setupFiles: ['tests/setup.ts'],
		clearMocks: true,
		include: ['tests/**/*.test.ts'],
		coverage: {
			reporter: ['text', 'html']
		}
	}
});
