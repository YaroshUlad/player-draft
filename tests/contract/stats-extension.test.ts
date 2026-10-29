import {describe, expect, it} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {VkPlayerAdapter} from '../../packages/engines/vk/src/vk-player-adapter';
import {OneStatProvider} from '../../packages/extensions/stats/src/one-stat-provider';
import {StatsExtension} from '../../packages/extensions/stats/src/stats-extension';
import {StatsOutbox} from '../../packages/extensions/stats/src/stats-outbox';
import {Uv2025StatsProvider} from '../../packages/extensions/stats/src/uv-2025-provider';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, FakeClock, FakeVkPlayer, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';
import {FakeStatsTransport} from '../../packages/testing/src/fake-stats';
import {createLegacyVodTrace} from '../../packages/testing/src/legacy-vod-trace';
import {assertStatsTrace, recordsToStatsTrace} from '../../packages/testing/src/stats-trace-comparator';

function createPlayer() {
	const factory = new FakeAdapterFactory();
	const clock = new FakeClock();
	const core = new PlaybackCore(factory, clock);
	const uvTransport = new FakeStatsTransport();
	const oneTransport = new FakeStatsTransport();
	const outbox = new StatsOutbox({'uv-2025': uvTransport, 'one-stat': oneTransport});
	const stats = new StatsExtension({
		providers: [new Uv2025StatsProvider(), new OneStatProvider()],
		outbox,
		autoFlush: false,
		coverageHeartbeatMs: 10_000,
		createVsid: () => 'vsid-test'
	});
	const player = new PlayerLib({core, eventTarget: new EventTarget(), extensions: [stats]});
	return {player, factory, clock, outbox, uvTransport, oneTransport};
}

async function initPlayer(player: PlayerLib): Promise<void> {
	await player.init({
		appVersion: 'test',
		uid: 'device',
		token: 'token',
		statsToken: 'stats-token',
		isAnonymous: true,
		locale: 'ru',
		host: 'https://api.test',
		proxyHost: '',
		node: {} as HTMLDivElement,
		capabilities: fakeCapabilities
	});
}

describe('StatsExtension', () => {
	it('preserves startup, playback, coverage and shutdown event order', async () => {
		const {player, factory, clock, outbox, uvTransport, oneTransport} = createPlayer();
		await initPlayer(player);
		await player.open(fakePlaylistItem);

		expect(outbox.getPending('uv-2025').map((record) => record.payload.event_name)).toEqual([
			'start_session',
			'play',
			'ready',
			'playback_started',
			'telemetry'
		]);

		const playback = player.getPlaybackInterface();
		factory.adapters[0]?.emit({type: 'firstBytes'});
		factory.adapters[0]?.emit({type: 'firstBytes'});
		factory.adapters[0]?.emit({type: 'firstFrame'});
		for (const position of [2_000, 3_000, 4_000]) {
			clock.advance(1000);
			factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: position});
		}
		await playback.seek(30_000);
		await playback.pause();
		await player.close();

		const names = uvTransport.batches.flat().map((record) => record.payload.event_name);
		expect(names).toEqual([
			'start_session',
			'play',
			'ready',
			'playback_started',
			'telemetry',
			'first_byte_media',
			'first_video_frame_decoded',
			'watched_n',
			'seeking',
			'buffer_starvation',
			'watch_coverage',
			'seeked',
			'telemetry',
			'pause',
			'stop'
		]);
		expect(names.filter((name) => name === 'first_byte_media')).toHaveLength(1);
		expect(names.filter((name) => name === 'watched_n')).toHaveLength(1);

		const coverage = uvTransport.batches.flat().find((record) => record.payload.event_name === 'watch_coverage');
		expect(coverage?.payload).toMatchObject({start: 1_000, end: 4_000});
		const events = uvTransport.batches.flat();
		expect(events.map((event) => event.payload.event_number)).toEqual(
			Array.from({length: events.length}, (_, index) => index)
		);
		expect(events[0]?.payload).toMatchObject({uv_movie_id: '-1_1', vsid: 'vsid-test'});
		assertStatsTrace(createLegacyVodTrace('vsid-test'), recordsToStatsTrace(events));
		expect(oneTransport.batches.flat().map((record) => record.payload.event_name)).toContain('first_frame');
		expect(outbox.getPending()).toHaveLength(0);
	});

	it('does not duplicate VK built-in OneStat', async () => {
		const uvTransport = new FakeStatsTransport();
		const oneTransport = new FakeStatsTransport();
		const outbox = new StatsOutbox({'uv-2025': uvTransport, 'one-stat': oneTransport});
		const stats = new StatsExtension({
			providers: [new Uv2025StatsProvider(), new OneStatProvider()],
			outbox,
			autoFlush: false
		});
		const vkPlayer = new FakeVkPlayer();
		const core = new PlaybackCore({create: () => new VkPlayerAdapter(vkPlayer)});
		const player = new PlayerLib({core, eventTarget: new EventTarget(), extensions: [stats]});
		await initPlayer(player);
		await player.open(fakePlaylistItem);
		await player.close();

		expect(uvTransport.batches.flat().length).toBeGreaterThan(0);
		expect(oneTransport.batches).toHaveLength(0);
	});
});
