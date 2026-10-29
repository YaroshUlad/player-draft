import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {getDevPage} from '../../ops/dev-page';

const root = resolve(process.cwd());

export function createFixtureServer() {
	return createServer(async (request, response) => {
		const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
		if (pathname === '/stats') {
			response.writeHead(204);
			response.end();
			return;
		}
		const file = pathname === '/' || pathname === '/player.js' ? 'dist/tv/player.js'
			: pathname === '/esm-player.js' ? 'dist/esm/player.js'
				: pathname === '/legacy-player.js' ? '../one-smart-tv-player-js-sdk/lib/dist/0.5.52/pc/app.js'
					: pathname === '/video.mp4' ? 'tests/e2e/fixtures/video.mp4'
						: pathname.startsWith('/hls/') ? `tests/e2e/fixtures/hls/${pathname.slice(5)}`
							: pathname.startsWith('/dash/') ? `tests/e2e/fixtures/dash/${pathname.slice(6)}`
								: null;

		if (!file) {
			response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
			response.end(getDevPage());
			return;
		}

		try {
			const absolutePath = resolve(root, file);
			const info = await stat(absolutePath);
			const contentType = file.endsWith('.mp4') ? 'video/mp4'
				: file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
					: file.endsWith('.mpd') ? 'application/dash+xml'
						: file.endsWith('.ts') ? 'video/mp2t'
							: 'text/javascript';
			const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
			if (range) {
				const start = Number(range[1]);
				const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
				if (start >= info.size || end < start) {
					response.writeHead(416, {'content-range': `bytes */${info.size}`});
					response.end();
					return;
				}
				response.writeHead(206, {
					'content-type': contentType,
					'content-length': end - start + 1,
					'content-range': `bytes ${start}-${end}/${info.size}`,
					'accept-ranges': 'bytes'
				});
				createReadStream(absolutePath, {start, end}).pipe(response);
				return;
			}
			response.writeHead(200, {
				'content-type': contentType,
				'content-length': info.size,
				'accept-ranges': 'bytes'
			});
			createReadStream(absolutePath).pipe(response);
		} catch {
			response.writeHead(404);
			response.end();
		}
	});
}
