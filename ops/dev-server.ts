import {createFixtureServer} from '../tests/e2e/server';

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
const server = createFixtureServer();

server.listen(port, host, () => {
	console.log(`VKTV player dev server: http://${host}:${port}`);
	console.log('MP4: /video.mp4, HLS: /hls/master.m3u8, DASH: /dash/manifest.mpd');
});

server.on('error', (error) => {
	console.error(error);
	process.exitCode = 1;
});

process.on('SIGINT', () => {
	server.close(() => process.exit(0));
});
