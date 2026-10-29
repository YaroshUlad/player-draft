import {expect, test} from '@playwright/test';
import type {InitData, IPlayerLib, PublicPlayback} from '../../packages/contracts/src/public-api';
import type {createHttpTransport as CreateHttpTransport} from '../../packages/infrastructure/http/src/http-transport-factory';
import type {HttpRequest, HttpResponse} from '../../packages/infrastructure/http/src/types';
import type {PlayerLib as PlayerLibClass} from '../../packages/sdk/src/player-lib';
import type {createDefaultStatsExtension as CreateDefaultStatsExtension} from '../../packages/extensions/stats/src/create-stats-extension';
import {assertStatsTrace} from '../../packages/testing/src/stats-trace-comparator';
import type {StatsTraceEvent} from '../../packages/testing/src/stats-trace-comparator';
import legacyCapturedTrace from '../fixtures/legacy-vod-trace.json' with {type: 'json'};
import {createFixtureServer} from './server';

interface E2EWindow extends Window {
	playerLib: IPlayerLib;
	playerEvents: string[];
}

interface LegacyStatEvent {
	Xa(): boolean;
	ga(): Record<string, unknown>;
}

interface LegacyProvider {
	isEnabled(): boolean;
	ua(): {log(events: LegacyStatEvent | LegacyStatEvent[]): void; flush(): void};
}

interface LegacyWindow extends Window {
	playerLib: {
		init(data: InitData): Promise<void>;
		open(item: unknown, uiConfig?: object): Promise<void>;
		close(): Promise<void>;
		getPlaybackInterface(): PublicPlayback;
		j: {g: Record<string, unknown>; ne: LegacyProvider[]};
	};
	legacyEvents: Record<string, unknown>[];
}

const server = createFixtureServer();

function toComparableTrace(events: readonly Record<string, unknown>[], vsid?: string): StatsTraceEvent[] {
	return events.map((event) => ({
		destination: 'uv-2025',
		eventName: String(event.event_name),
		eventNumber: Number(event.event_number),
		payload: {
			vsid: vsid ?? event.vsid,
			uv_movie_id: event.uv_movie_id,
			event_name: event.event_name,
			event_number: event.event_number,
			playback_position: event.playback_position,
			cdn_host: event.cdn_host,
			current_tvt: event.current_tvt,
			...(event.stats_version !== undefined ? {stats_version: event.stats_version} : {}),
			...(event.stream_profile !== undefined ? {stream_profile: event.stream_profile} : {}),
			...(event.content_type !== undefined ? {content_type: event.content_type} : {}),
			...(event.user_quality !== undefined ? {user_quality: event.user_quality} : {}),
			...(event.playback_rate !== undefined ? {playback_rate: event.playback_rate} : {}),
			...(event.muted !== undefined ? {muted: event.muted} : {}),
			...(event.sound_volume !== undefined ? {sound_volume: event.sound_volume} : {})
		}
	}));
}

test.beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(4173, '127.0.0.1', resolve));
});

test.afterAll(async () => {
	await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('native MP4 works through the public facade without UI', async ({page}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto('/demo');
	await page.waitForFunction(() => 'playerLib' in window);

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		browserWindow.playerEvents = [];
		for (const name of [
			'player-playing', 'player-paused', 'player-time-update', 'player-first-frame',
			'player-buffering-started', 'player-buffering-ended', 'event-video-ended'
		]) {
			document.addEventListener(name, () => browserWindow.playerEvents.push(name));
		}
		await browserWindow.playerLib.init({
			appVersion: 'e2e',
			uid: 'device',
			token: 'token',
			statsToken: 'stats',
			isAnonymous: true,
			locale: 'ru',
			host: 'http://127.0.0.1:4173',
			proxyHost: '',
			node: document.getElementById('player-surface') as HTMLDivElement
		});
		await browserWindow.playerLib.open({
			model: {
				rawId: 'local-mp4',
				type: 'video',
				files: {mp4720: '/video.mp4'}
			},
			playback: {isAutoplay: false}
		}, {autoplay: false, muted: true, startPositionMs: 500});
	});

	const playbackState = (): Promise<string> => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getState();
	});
	await expect.poll(playbackState).toBe('ready');
	const readyPosition = await page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().currentTime;
	});
	expect(readyPosition).toBeGreaterThanOrEqual(450);
	expect(readyPosition).toBeLessThanOrEqual(550);

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.getPlaybackInterface().play();
	});
	await expect.poll(playbackState).toBe('playing');
	await expect.poll(() => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().currentTime;
	})).toBeGreaterThan(500);

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.getPlaybackInterface().pause();
	});
	await expect.poll(playbackState).toBe('paused');

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.getPlaybackInterface().seek(1_000);
	});
	await expect.poll(() => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().currentTime;
	})).toBeGreaterThanOrEqual(950);

	const browserState = await page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		const video = document.querySelector('video');
		return {
			events: browserWindow.playerEvents,
			controls: video?.controls,
			videoCount: document.querySelectorAll('video').length
		};
	});
	expect(browserState.controls).toBe(false);
	expect(browserState.videoCount).toBe(1);
	expect(browserState.events).toContain('player-first-frame');
	expect(browserState.events).toContain('player-playing');
	expect(browserState.events).toContain('player-paused');
	expect(browserState.events).toContain('player-time-update');

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.close();
	});
	await expect.poll(playbackState).toBe('idle');
	await expect.poll(() => page.locator('video').count()).toBe(0);

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.open({
			model: {rawId: 'local-mp4-reopen', type: 'video', files: {mp4720: '/video.mp4'}},
			playback: {isAutoplay: false}
		}, {autoplay: false, muted: true});
	});
	await expect.poll(playbackState).toBe('ready');
	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.destroy();
	});
	await expect.poll(playbackState).toBe('idle');
	await expect.poll(() => page.locator('video').count()).toBe(0);
	expect(await page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.isInitialized();
	})).toBe(false);
	expect(pageErrors).toEqual([]);
});

test('HTTP factory uses real fetch and asynchronous XHR', async ({page}) => {
	await page.goto('/demo');
	const statuses = await page.evaluate(async () => {
		const dynamicImport = new Function('path', 'return import(path)') as (
			path: string
		) => Promise<{createHttpTransport: typeof CreateHttpTransport}>;
		const {createHttpTransport} = await dynamicImport('/esm-player.js');
		const request = {
			url: '/stats',
			method: 'POST' as const,
			headers: {'content-type': 'application/json'},
			body: '{"events":[]}',
			credentials: 'same-origin' as const
		};
		const fetchStatus = (await createHttpTransport().request(request)).status;
		const originalFetch = window.fetch;
		Object.defineProperty(window, 'fetch', {value: undefined, configurable: true});
		const xhrStatus = (await createHttpTransport().request(request)).status;
		Object.defineProperty(window, 'fetch', {value: originalFetch, configurable: true});
		return [fetchStatus, xhrStatus];
	});

	expect(statuses).toEqual([204, 204]);
});

test('legacy SDK emits a real UV trace without backend delivery', async ({page}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.route('**/*', (route) => {
		if (route.request().url().startsWith('http://127.0.0.1:4173')) {
			return route.continue();
		}
		const url = route.request().url();
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(url.includes('lang-pack.js') ? {id: 1, code: 3, keys: {}} : {response: []})
		});
	});
	await page.goto('/demo');
	await page.addScriptTag({url: '/legacy-player.js'});

	await page.evaluate(async () => {
		const browserWindow = window as unknown as LegacyWindow;
		browserWindow.legacyEvents = [];
		await browserWindow.playerLib.init({
			appVersion: 'legacy-trace',
			uid: 'pc:legacy-device',
			token: 'dummy-token',
			statsToken: '',
			isAnonymous: true,
			locale: 'en',
			host: 'api.test',
			proxyHost: '',
			node: document.getElementById('player-surface') as HTMLDivElement
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		browserWindow.playerLib.j.g.uvStat2025Enabled = true;
		browserWindow.playerLib.j.g.oneStatEnabled = false;
		browserWindow.playerLib.j.g.playerAdvertisementEnabled = false;
		browserWindow.playerLib.j.ne.forEach((provider, index) => {
			provider.isEnabled = () => index === 3;
			provider.ua = () => ({
				log: (events) => {
					const list = Array.isArray(events) ? events : [events];
					for (const event of list) {
						if (!event.Xa()) {
							browserWindow.legacyEvents.push(event.ga());
						}
					}
				},
				flush: () => undefined
			});
		});
		await browserWindow.playerLib.open({
			model: {
				id: '-1_1',
				ovId: 1,
				rawId: '-1_1',
				ownerId: -1,
				type: 'video',
				title: 'Local MP4',
				duration: 5_000,
				files: {mp4720: '/video.mp4'},
				trackCode: 'legacy-track',
				likes: {count: 0, userLikes: false}
			},
			playback: {
				loop: false,
				startPosition: 0,
				seekThreshold: 0.9,
				lastPosition: 0,
				isReplay: false,
				isAutoplay: false,
				isAutoplaySettingEnabled: false
			}
		}, {});
	});

	const playback = await page.evaluateHandle(() => {
		const browserWindow = window as unknown as LegacyWindow;
		return browserWindow.playerLib.getPlaybackInterface();
	});
	await playback.evaluate((api) => api.pause());
	await playback.evaluate((api) => api.seek(1_000));
	await page.waitForTimeout(200);
	await page.evaluate(async () => {
		const browserWindow = window as unknown as LegacyWindow;
		await browserWindow.playerLib.close();
	});
	const trace = await page.evaluate(() => {
		const browserWindow = window as unknown as LegacyWindow;
		return browserWindow.legacyEvents;
	});
	expect(trace.length).toBeGreaterThan(0);
	assertStatsTrace(
		toComparableTrace(legacyCapturedTrace.slice(0, 7), String(trace[0]?.vsid)),
		toComparableTrace(trace.slice(0, 7)),
		{payloadMode: 'subset'}
	);
	expect(pageErrors).toEqual([]);
});

test('new SDK emits a comparable UV trace without backend delivery', async ({page}) => {
	await page.goto('/demo');
	const trace = await page.evaluate(async () => {
		const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<{
			PlayerLib: typeof PlayerLibClass;
			createDefaultStatsExtension: typeof CreateDefaultStatsExtension;
		}>;
		const {PlayerLib, createDefaultStatsExtension} = await dynamicImport('/esm-player.js');
		const events: Record<string, unknown>[] = [];
		const httpTransport = {
			request: async (request: HttpRequest): Promise<HttpResponse> => {
				const body = JSON.parse(request.body ?? '{}') as {events: Record<string, unknown>[]};
				events.push(...body.events);
				return {status: 204, statusText: 'No Content', body: ''};
			}
		};
		const stats = createDefaultStatsExtension({
			endpoints: {uv2025: {url: '/stats'}},
			httpTransport,
			storage: null,
			autoFlush: false,
			createVsid: () => '1ikb54sozuo00'
		});
		const player = new PlayerLib({eventTarget: document, extensions: [stats]});
		await player.init({
			appVersion: 'new-trace',
			uid: 'new-device',
			token: 'dummy-token',
			statsToken: '',
			isAnonymous: true,
			locale: 'en',
			host: 'api.test',
			proxyHost: '',
			node: document.getElementById('player-surface') as HTMLDivElement
		});
		await player.open({
			model: {
				id: '-1_1',
				ovId: 1,
				rawId: '-1_1',
				ownerId: -1,
				type: 'video',
				title: 'Local MP4',
				duration: 5_000,
				files: {mp4720: '/video.mp4'},
				trackCode: 'new-track'
			},
			playback: {
				loop: false,
				startPosition: 0,
				lastPosition: 0,
				isReplay: false,
				isAutoplay: true,
				isAutoplaySettingEnabled: true
			}
		}, {autoplay: true});
		const playback = player.getPlaybackInterface();
		await playback.pause();
		await playback.seek(1_000);
		await new Promise<void>((resolve) => setTimeout(resolve, 200));
		await player.close();
		return events;
	});
	expect(trace.length).toBeGreaterThan(0);
	assertStatsTrace(
		toComparableTrace(legacyCapturedTrace.slice(0, 7)),
		toComparableTrace(trace.slice(0, 7)),
		{payloadMode: 'subset'}
	);
});

test('HLS.js plays a local HLS stream through the public facade', async ({page}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto('/demo');
	await page.waitForFunction(() => 'playerLib' in window);
	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.init({
			appVersion: 'hls-e2e',
			uid: 'hls-device',
			token: 'token',
			statsToken: 'stats',
			isAnonymous: true,
			locale: 'en',
			host: 'api.test',
			proxyHost: '',
			node: document.getElementById('player-surface') as HTMLDivElement
		});
		await browserWindow.playerLib.open({
			model: {
				rawId: 'local-hls',
				type: 'video',
				files: {hls: '/hls/master.m3u8'}
			},
			playback: {isAutoplay: true, isAutoplaySettingEnabled: true}
		}, {autoplay: true, muted: true});
	});

	const playbackState = (): Promise<string> => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getState();
	});
	await expect.poll(playbackState).toBe('playing');
	await expect.poll(() => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().currentTime;
	})).toBeGreaterThan(0);
	expect(await page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().quality;
	})).toBe('720p');

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.close();
	});
	await expect.poll(() => page.locator('video').count()).toBe(0);
	expect(pageErrors).toEqual([]);
});

test('Shaka plays local DASH with seek and cleanup', async ({page}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto('/demo');
	await page.waitForFunction(() => 'playerLib' in window);
	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.init({
			appVersion: 'dash-e2e',
			uid: 'dash-device',
			token: 'token',
			statsToken: 'stats',
			isAnonymous: true,
			locale: 'en',
			host: 'api.test',
			proxyHost: '',
			node: document.getElementById('player-surface') as HTMLDivElement
		});
		await browserWindow.playerLib.open({
			model: {
				rawId: 'local-dash',
				type: 'video',
				files: {dashSep: '/dash/manifest.mpd'}
			},
			playback: {isAutoplay: true, isAutoplaySettingEnabled: true}
		}, {autoplay: true, muted: true});
	});

	const playbackState = (): Promise<string> => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getState();
	});
	await expect.poll(playbackState).toBe('playing');
	await expect.poll(() => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().currentTime;
	})).toBeGreaterThan(0);
	expect(await page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().quality;
	})).toBe('360p');

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.getPlaybackInterface().seek(2_000);
	});
	await expect.poll(() => page.evaluate(() => {
		const browserWindow = window as unknown as E2EWindow;
		return browserWindow.playerLib.getPlaybackInterface().getStateInfo().currentTime;
	})).toBeGreaterThanOrEqual(1_900);

	await page.evaluate(async () => {
		const browserWindow = window as unknown as E2EWindow;
		await browserWindow.playerLib.close();
	});
	await expect.poll(() => page.locator('video').count()).toBe(0);
	expect(pageErrors).toEqual([]);
});
