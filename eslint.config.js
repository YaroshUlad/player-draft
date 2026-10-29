import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'tests/e2e/fixtures/**']
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['packages/**/*.ts', 'tests/**/*.ts'],
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
			'no-restricted-imports': ['error', {
				patterns: [
					{group: ['**/*.css', '**/*.jst', '**/scenes/**', '**/widgets/**', '**/components/**', '**/popups/**']}
				]
			}]
		}
	},
	{
		files: ['packages/core/**/*.ts'],
		rules: {
			'no-restricted-imports': ['error', {
				patterns: [
					{group: ['**/sdk/**', '**/extensions/**', '**/infrastructure/**', '**/*.css', '**/*.jst']}
				]
			}]
		}
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			globals: {
				console: 'readonly',
				process: 'readonly'
			}
		}
	}
);
