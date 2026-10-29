import {describe, expect, it, vi} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {LiveExtension} from '../../packages/extensions/live/src/live-extension';
import {CustomEventDispatcher} from '../../packages/sdk/src/custom-event-dispatcher';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, FakeClock, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

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

describe('runtime recovery', () => {
	it('opens the next source after a runtime error and preserves position', async () => {
		const factory = new FakeAdapterFactory();
		const originalCreate = factory.create.bind(factory);
		factory.create = (source, capabilities) => {
			const adapter = originalCreate(source, capabilities);
			if (factory.adapters.length === 2) {
				adapter.failPrepare(new Error('second source failed'));
			}
			return adapter;
		};
		const player = new PlayerLib({core: new PlaybackCore(factory), eventTarget: new EventTarget()});
		await initPlayer(player);
		await player.open(fakePlaylistItem);

		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 5_000});
		factory.adapters[0]?.emit({type: 'error', error: {code: 'NETWORK', message: 'network', fatal: true}});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(3));

		expect(player.getPlaybackInterface().getStateInfo().currentTime).toBe(5_000);
		expect(player.getPlaybackInterface().getState()).toBe('playing');
	});

	it('reports recover-fail when runtime candidates are exhausted', async () => {
		const factory = new FakeAdapterFactory();
		const originalCreate = factory.create.bind(factory);
		factory.create = (source, capabilities) => {
			const adapter = originalCreate(source, capabilities);
			if (factory.adapters.length > 1) {
				adapter.failPrepare(new Error('runtime recovery failed'));
			}
			return adapter;
		};
		const eventTarget = new EventTarget();
		const player = new PlayerLib({core: new PlaybackCore(factory), eventTarget});
		let reason = '';
		eventTarget.addEventListener('player-recovery-failed', (event) => {
			reason = (event as CustomEvent).detail.reason;
		});
		await initPlayer(player);
		await player.open(fakePlaylistItem);

		factory.adapters[0]?.emit({type: 'error', error: {code: 'NETWORK', message: 'network', fatal: true}});
		await vi.waitFor(() => expect(reason).toBe('recover-fail'));
	});
});

describe('LiveExtension', () => {
	it('rewinds after a long live pause', async () => {
		const factory = new FakeAdapterFactory();
		const clock = new FakeClock();
		const player = new PlayerLib({core: new PlaybackCore(factory, clock), eventTarget: new EventTarget()});
		await initPlayer(player);
		const item = {
			...fakePlaylistItem,
			model: {...fakePlaylistItem.model, type: 'live' as const, isLive: true, liveCanRewind: true}
		};
		await player.open(item);
		const playback = player.getPlaybackInterface();
		await playback.pause();
		clock.advance(61_000);

		await playback.play();

		const state = player.getPlaybackInterface().getStateInfo();
		expect(state.currentTime).toBeGreaterThanOrEqual(0);
		expect(factory.adapters[0]?.getTechnicalSnapshot().live.offsetMs).toBe(61_000);
	});

	it('emits status change once and reloads on upcoming to started', async () => {
		const core = new PlaybackCore(new FakeAdapterFactory());
		const eventTarget = new EventTarget();
		const dispatcher = new CustomEventDispatcher(eventTarget);
		let status: 'upcoming' | 'started' = 'upcoming';
		const reload = vi.fn(async () => undefined);
		const live = new LiveExtension({
			core,
			reload,
			dispatcher,
			getLiveStatus: async () => status,
			intervalMs: 0
		});
		const item = {
			...fakePlaylistItem,
			model: {...fakePlaylistItem.model, type: 'live' as const, isLive: true, liveStatus: 'upcoming' as const}
		};
		const transitions: string[] = [];
		eventTarget.addEventListener('player-live-status-changed', (event) => {
			const detail = (event as CustomEvent).detail;
			transitions.push(`${detail.from}->${detail.to}`);
		});
		live.beforeOpen(item);
		status = 'started';

		await live.pollLiveStatus();
		await live.pollLiveStatus();

		expect(transitions).toEqual(['upcoming->started']);
		expect(reload).toHaveBeenCalledTimes(1);
		expect(reload).toHaveBeenCalledWith(item, {});
		await live.shutdown();
	});
});
