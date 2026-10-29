import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const extensions = ['.ts'];

function createPlugins(minify = false) {
	const plugins = [
		commonjs(),
		nodeResolve({extensions}),
		typescript({
			tsconfig: './tsconfig.base.json',
			include: ['packages/**/*.ts'],
			declaration: false,
			declarationMap: false,
			noEmitOnError: true
		}),
		babel({
			babelHelpers: 'bundled',
			extensions,
			presets: [
				['@babel/preset-env', {
					targets: {chrome: '34'},
					modules: false
				}]
			]
		})
	];

	return minify ? [...plugins, terser({ecma: 5})] : plugins;
}

export default [
	{
		input: 'packages/sdk/src/index.ts',
		output: {
			file: 'dist/esm/player.js',
			format: 'es',
			sourcemap: true
		},
		plugins: createPlugins()
	},
	{
		input: 'packages/sdk/src/global.ts',
		output: {
			file: 'dist/tv/player.js',
			format: 'iife',
			name: 'playerLib',
			exports: 'default',
			sourcemap: true
		},
		plugins: createPlugins(true)
	}
];
