import {describe, expect, it, vi} from 'vitest';
import type {AdapterFactory} from '../../packages/contracts/src/playback';
import type {PlaylistItem} from '../../packages/contracts/src/playlist-item';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

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

function createPlayer(factory: AdapterFactory = new FakeAdapterFactory()) {
	const eventTarget = new EventTarget();
	const player = new PlayerLib({core: new PlaybackCore(factory), eventTarget});
	return {player, eventTarget, factory};
}

function createFailingFactory(): {factory: FakeAdapterFactory; adapters: FakeAdapterFactory['adapters']} {
	const factory = new FakeAdapterFactory();
	return {factory, adapters: factory.adapters};
}

describe('RecoveryExtension', () => {
	it('opens the next source after a prepare failure', async () => {
		const {factory} = createFailingFactory();
		const originalCreate = factory.create.bind(factory);
		factory.create = (source, capabilities) => {
			const adapter = originalCreate(source, capabilities);
			if (factory.adapters.length === 1) {
				adapter.failPrepare(new Error('first source failed'));
			}
			return adapter;
		};
		const {player, eventTarget} = createPlayer(factory);
		let recoveryFailed = false;
		eventTarget.addEventListener('player-recovery-failed', () => {
			recoveryFailed = true;
		});
		await initPlayer(player);

		await player.open(fakePlaylistItem, {autoplay: false});

		expect(factory.adapters).toHaveLength(2);
		expect(player.getPlaybackInterface().getState()).toBe('ready');
		expect(recoveryFailed).toBe(false);
	});

	it('reports terminal failure only after all sources fail', async () => {
		const {factory} = createFailingFactory();
		const originalCreate = factory.create.bind(factory);
		factory.create = (source, capabilities) => {
			const adapter = originalCreate(source, capabilities);
			adapter.failPrepare(new Error('source failed'));
			return adapter;
		};
		const {player, eventTarget} = createPlayer(factory);
		let reason = '';
		eventTarget.addEventListener('player-recovery-failed', (event) => {
			reason = (event as CustomEvent).detail.reason;
		});
		await initPlayer(player);

		await expect(player.open(fakePlaylistItem)).rejects.toThrow('source failed');
		expect(factory.adapters.length).toBeGreaterThan(1);
		expect(reason).toBe('playback-is-not-available');
	});
});

describe('PlaylistExtension', () => {
	it('reopens a looping item and suppresses the previous ended event', async () => {
		const factory = new FakeAdapterFactory();
		const {player, eventTarget} = createPlayer(factory);
		let endedEvents = 0;
		eventTarget.addEventListener('event-video-ended', () => {
			endedEvents++;
		});
		await initPlayer(player);
		const item: PlaylistItem = {
			...fakePlaylistItem,
			playback: {...fakePlaylistItem.playback, loop: true}
		};
		await player.open(item, {autoplay: false});

		factory.adapters[0]?.emit({type: 'ended'});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(2));

		expect(endedEvents).toBe(0);
		expect(player.getPlaybackInterface().getState()).toBe('playing');
		await player.close();
	});

	it('emits ended once for a non-looping item', async () => {
		const factory = new FakeAdapterFactory();
		const {player, eventTarget} = createPlayer(factory);
		let endedEvents = 0;
		eventTarget.addEventListener('event-video-ended', () => {
			endedEvents++;
		});
		await initPlayer(player);
		await player.open(fakePlaylistItem, {autoplay: false});

		factory.adapters[0]?.emit({type: 'ended'});

		expect(endedEvents).toBe(1);
		expect(factory.adapters).toHaveLength(1);
	});
});
