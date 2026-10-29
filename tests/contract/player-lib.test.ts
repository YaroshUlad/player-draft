import {describe, expect, it} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {FakeAdapterFactory, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

function createPlayer() {
	const factory = new FakeAdapterFactory();
	const core = new PlaybackCore(factory);
	const eventTarget = new EventTarget();
	const player = new PlayerLib({core, eventTarget});
	return {player, factory, core, eventTarget};
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

describe('PlayerLib public contract', () => {
	it('plays through the preserved facade and emits only CustomEvent', async () => {
		const {player, factory, eventTarget} = createPlayer();
		const names: string[] = [];
		const details: unknown[] = [];
		for (const name of ['player-buffering-started', 'player-buffering-ended', 'player-playing', 'player-time-update']) {
			eventTarget.addEventListener(name, (event) => {
				names.push(name);
				details.push((event as CustomEvent).detail);
			});
		}
		await initPlayer(player);

		await player.open(fakePlaylistItem);
		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 2_000});

		expect(player.isInitialized()).toBe(true);
		expect(player.getPlaybackInterface().getState()).toBe('playing');
		expect(names).toEqual([
			'player-buffering-started',
			'player-buffering-ended',
			'player-playing',
			'player-time-update'
		]);
		expect(details[details.length - 1]).toEqual({time: 2_000});
	});

	it('autoplays by default unless playback settings disable it', async () => {
		const {player} = createPlayer();
		await initPlayer(player);
		const item = {...fakePlaylistItem, playback: {}};

		await player.open(item);
		expect(player.getPlaybackInterface().getState()).toBe('playing');

		await player.open({...item, playback: {isAutoplay: false}});
		expect(player.getPlaybackInterface().getState()).toBe('ready');

		await player.open({...item, playback: {isAutoplaySettingEnabled: false}});
		expect(player.getPlaybackInterface().getState()).toBe('ready');
	});

	it('resumes from startPosition when lastPosition is zero', async () => {
		const {player} = createPlayer();
		await initPlayer(player);

		await player.open({
			...fakePlaylistItem,
			playback: {startPosition: 5_000, lastPosition: 0, isAutoplay: false}
		});

		expect(player.getPlaybackInterface().getStateInfo().currentTime).toBe(5_000);
	});

	it('supports playback methods and close/reopen lifecycle', async () => {
		const {player} = createPlayer();
		await initPlayer(player);
		await player.open(fakePlaylistItem);

		const playback = player.getPlaybackInterface();
		await playback.pause();
		await playback.seek(5_000);
		expect(playback.getStateInfo().currentTime).toBe(5_000);
		expect(playback.getState()).toBe('paused');
		expect(playback.getId()).toBe('-1_1');

		await player.close();
		expect(playback.getState()).toBe('idle');
		await player.open(fakePlaylistItem, {autoplay: false});
		expect(playback.getState()).toBe('ready');

		await player.destroy();
		expect(player.isInitialized()).toBe(false);
	});

	it('keeps player-ds quality and track event compatibility', async () => {
		const {player, factory, eventTarget} = createPlayer();
		await initPlayer(player);
		await player.open(fakePlaylistItem);
		const playback = player.getPlaybackInterface();
		await playback.setQuality('360p', null as unknown as number);
		let detail: unknown;
		eventTarget.addEventListener('playback-properties-update', (event) => {
			detail = (event as CustomEvent).detail;
		});
		factory.adapters[0]?.emit({type: 'tracksChange'});

		expect(playback.getCurrentQualityType()).toBe('360p');
		expect(detail).toMatchObject({
			audioTracks: [{name: 'Default', description: 'und', value: 'default'}],
			currentAudioTrackIndex: 0,
			textTracks: []
		});
	});

	it('validates token updates', async () => {
		const {player} = createPlayer();
		await initPlayer(player);

		await expect(player.updateToken({token: '', isAnonymous: true})).rejects.toThrow('Pass "token"');
	});
});
