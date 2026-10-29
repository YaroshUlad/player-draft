import {describe, expect, it, vi} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, FakeClock, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

const programme = [
	{id: 'programme-1', title: 'First', startAtMs: 1_000, stopAtMs: 2_000},
	{id: 'programme-2', title: 'Second', startAtMs: 2_000, stopAtMs: 3_000}
];

function createPlayer(clock = new FakeClock()) {
	const factory = new FakeAdapterFactory();
	const eventTarget = new EventTarget();
	const player = new PlayerLib({
		core: new PlaybackCore(factory, clock),
		eventTarget,
		tvProgrammeProvider: async () => programme,
		tvServerTimeProvider: async () => 1_500,
		tvAdCreativeProvider: () => ({
			id: 'scte-ad-1',
			url: 'https://ads.test/scte.mp4',
			mediaType: 'mp4',
			durationMs: 1_000
		})
	});
	return {player, factory, eventTarget, clock};
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

function tvItem() {
	return {
		...fakePlaylistItem,
		model: {
			...fakePlaylistItem.model,
			type: 'tv_channel' as const,
			isLive: true,
			isVitrina: true,
			showProgram: true,
			programme,
			scte35Actions: [{timestampMs: 3_000, uniqueProgramId: 42}]
		}
	};
}

describe('TvChannelExtension', () => {
	it('publishes server time and current/next programme', async () => {
		const {player, eventTarget} = createPlayer();
		const updates: unknown[] = [];
		let serverTime = 0;
		let legacyTime = 0;
		eventTarget.addEventListener('tv-channel-programme-update', (event) => {
			updates.push((event as CustomEvent).detail);
		});
		eventTarget.addEventListener('tv-channel-server-time-update', (event) => {
			serverTime = (event as CustomEvent).detail.serverTime;
			legacyTime = (event as CustomEvent).detail.time;
		});
		await initPlayer(player);

		await player.open(tvItem(), {autoplay: false});

		expect(serverTime).toBe(1_500);
		expect(legacyTime).toBe(1_500);
		expect(updates).toEqual([{current: programme[0], next: programme[1]}]);
	});

	it('opens SCTE-35 midroll and resumes content', async () => {
		const {player, factory} = createPlayer();
		await initPlayer(player);
		await player.open(tvItem(), {autoplay: false});

		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 5_000});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(2));
		factory.adapters[1]?.emit({type: 'ended'});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(3));

		expect(player.getPlaybackInterface().getStateInfo().currentTime).toBe(5_000);
	});

	it('emits Vitrina first play, heartbeat and content end', async () => {
		const {player, factory, eventTarget, clock} = createPlayer();
		const names: string[] = [];
		eventTarget.addEventListener('prod-stat-event', (event) => {
			names.push((event as CustomEvent).detail.eventName);
		});
		await initPlayer(player);
		await player.open(tvItem());
		clock.advance(30_000);

		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 1_000});
		factory.adapters[0]?.emit({type: 'ended'});

		expect(names).toContain('vitrina_tv_first_play_or_ad');
		expect(names).toContain('vitrina_tv_heartbeat');
		expect(names).toContain('vitrina_tv_content_end');
	});
});
