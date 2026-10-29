export function getDevPage(): string {
	return `<!doctype html>
<html lang="ru">
<head>
	<meta charset="utf-8">
	<title>VKTV Player Draft</title>
	<style>
		body { font-family: sans-serif; background: #111; color: #eee; padding: 24px; }
		#player-surface { width: 960px; max-width: 100%; aspect-ratio: 16 / 9; background: #000; margin-bottom: 16px; }
		#player-surface video { width: 100%; height: 100%; }
		button { margin-right: 8px; padding: 8px 16px; }
		#events { white-space: pre-wrap; font-family: monospace; font-size: 12px; }
	</style>
</head>
<body>
	<h1>VKTV Player Draft</h1>
	<div id="player-surface"></div>
	<button id="play">Play</button>
	<button id="pause">Pause</button>
	<button id="seek">Seek +1s</button>
	<button id="close">Close</button>
	<h2>Events</h2>
	<div id="events"></div>
	<script src="/player.js"></script>
	<script>
		const events = document.getElementById('events');
		const player = window.playerLib;
		const playback = player.getPlaybackInterface();
		const item = {
			model: {
				rawId: 'local-dev-video',
				ovId: 1,
				type: 'video',
				files: {mp4720: '/video.mp4'}
			},
			playback: {isAutoplay: true, isAutoplaySettingEnabled: true}
		};
		const names = [
			'player-playing', 'player-paused', 'player-time-update', 'player-first-frame',
			'player-buffering-started', 'player-buffering-ended', 'event-video-ended'
		];
		for (const name of names) {
			document.addEventListener(name, (event) => {
				events.textContent = name + ' ' + JSON.stringify(event.detail) + '\\n' + events.textContent;
			});
		}
		document.getElementById('play').addEventListener('click', () => playback.play());
		document.getElementById('pause').addEventListener('click', () => playback.pause());
		document.getElementById('seek').addEventListener('click', () => {
			playback.seek(playback.getStateInfo().currentTime + 1000);
		});
		document.getElementById('close').addEventListener('click', () => player.close());
		player.init({
			appVersion: 'dev',
			uid: 'dev-browser',
			token: 'dev-token',
			statsToken: '',
			isAnonymous: true,
			locale: 'ru',
			host: '127.0.0.1',
			proxyHost: '',
			node: document.getElementById('player-surface')
		}).then(() => player.open(item, {autoplay: true, muted: true}));
	</script>
</body>
</html>`;
}
