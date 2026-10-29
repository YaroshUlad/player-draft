import {describe, expect, it, vi} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {StatsExtension} from '../../packages/extensions/stats/src/stats-extension';
import {StatsOutbox} from '../../packages/extensions/stats/src/stats-outbox';
import {Uv2025StatsProvider} from '../../packages/extensions/stats/src/uv-2025-provider';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';
import {FakeStatsTransport} from '../../packages/testing/src/fake-stats';

function createPlayer(factory = new FakeAdapterFactory()) {
	const uvTransport = new FakeStatsTransport();
	const outbox = new StatsOutbox({'uv-2025': uvTransport});
	const stats = new StatsExtension({
		providers: [new Uv2025StatsProvider()],
		outbox,
		autoFlush: false,
		createVsid: () => 'vsid-ads'
	});
	const player = new PlayerLib({core: new PlaybackCore(factory), eventTarget: new EventTarget(), extensions: [stats]});
	return {player, factory, uvTransport};
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

function itemWithPreroll() {
	return {
		...fakePlaylistItem,
		model: {
			...fakePlaylistItem.model,
			ads: {
				preroll: [{
					id: 'ad-stats-1',
					url: 'https://ads.test/ad.mp4',
					mediaType: 'mp4' as const,
					durationMs: 1_000
				}]
			}
		}
	};
}

describe('advertising stats', () => {
	it('emits UV ad break events before content playback', async () => {
		const {player, factory, uvTransport} = createPlayer();
		await initPlayer(player);
		const open = player.open(itemWithPreroll());
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(1));
		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 500});
		factory.adapters[0]?.emit({type: 'ended'});
		await open;
		await player.close();

		const events = uvTransport.batches.flat();
		const names = events.map((event) => event.payload.event_name);
		expect(names.slice(0, 3)).toEqual(['adv_request', 'adv_break_started', 'adv_break_ended']);
		expect(names.indexOf('playback_started')).toBeGreaterThan(names.indexOf('adv_break_ended'));
		expect(events[0]?.payload).toMatchObject({
			adv_position: 'preroll',
			adv_creative_id: 'ad-stats-1',
			adv_duration: 1_000,
			current_tvt: 0,
			event_number: 0
		});
		expect(events[1]?.payload.event_number).toBe(1);
		expect(events[2]?.payload.event_number).toBe(2);
		expect(names).toContain('start_session');
	});

	it('emits adv_error and closes the ad break on failure', async () => {
		const factory = new FakeAdapterFactory();
		const originalCreate = factory.create.bind(factory);
		factory.create = (source, capabilities) => {
			const adapter = originalCreate(source, capabilities);
			if (factory.adapters.length === 1) {
				adapter.failPrepare(new Error('ad failed'));
			}
			return adapter;
		};
		const {player, uvTransport} = createPlayer(factory);
		await initPlayer(player);
		await player.open(itemWithPreroll());
		await player.close();

		const names = uvTransport.batches.flat().map((event) => event.payload.event_name);
		expect(names).toContain('adv_error');
		expect(names.indexOf('adv_error')).toBeLessThan(names.indexOf('adv_break_ended'));
	});
});
