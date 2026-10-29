import {afterEach, describe, expect, it, vi} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import {VkPlayerAdapter} from '../../packages/engines/vk/src/vk-player-adapter';
import {createDefaultCore} from '../../packages/sdk/src/create-default-core';
import {FakeVkPlayer, createOpenRequest, fakeCapabilities} from '../../packages/testing/src';

function createAdapter() {
	const player = new FakeVkPlayer();
	const adapter = new VkPlayerAdapter(player);
	return {player, adapter};
}

function createPrepareRequest(surface = {} as HTMLElement) {
	return {
		source: {
			url: 'https://media.test/video.mpd',
			format: 'dash' as const,
			variant: 'dashSep',
			mimeType: 'application/dash+xml',
			failoverHost: 'https://fallback.test'
		},
		surface,
		startPositionMs: 0,
		muted: true,
		capabilities: fakeCapabilities
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('VkPlayerAdapter', () => {
	it('prepares without hidden autoplay and maps DASH source', async () => {
		const {player, adapter} = createAdapter();
		const events: string[] = [];
		adapter.subscribe((event) => events.push(event.type));

		await adapter.prepare(createPrepareRequest());

		expect(player.playCalls).toBe(0);
		expect(player.initConfig).toMatchObject({
			isMuted: true,
			failoverHosts: ['https://fallback.test'],
			sources: {
				DASH_SEP: {type: 'url', url: 'https://media.test/video.mpd', compatibilityMode: true}
			}
		});
		expect(events).toContain('ready');
	});

	it('supports core playback, tracks, quality, rate and volume', async () => {
		const player = new FakeVkPlayer();
		const core = new PlaybackCore({create: () => new VkPlayerAdapter(player)});
		await core.open(createOpenRequest({
			source: createPrepareRequest().source,
			autoplay: false
		}));

		expect(core.getSnapshot().state).toBe('ready');
		expect(core.getSnapshot().engine?.type).toBe('vkplayer');
		expect(player.playCalls).toBe(0);

		await core.play(core.createCommand('play'));
		await core.seek(5_000, core.createCommand('seek'));
		await core.setQuality('1080p', core.createCommand('quality'));
		await core.setAudioTrack('en', core.createCommand('audio'));
		await core.setTextTrack('en', core.createCommand('text'));
		await core.setPlaybackRate(1.5, core.createCommand('rate'));
		await core.setVolume(0.4, core.createCommand('volume'));
		await core.setMuted(true, core.createCommand('mute'));

		expect(core.getSnapshot().state).toBe('playing');
		expect(player.lastSeekSeconds).toBe(5);
		expect(core.getSnapshot().quality).toMatchObject({requested: '1080p', current: '1080p', isAuto: false});
		expect(core.getSnapshot().audioTracks.find((track) => track.id === 'en')?.isDefault).toBe(true);
		expect(core.getSnapshot().playbackRate).toBe(1.5);
		expect(core.getSnapshot().volume).toBe(0.4);
		expect(core.getSnapshot().muted).toBe(true);
	});

	it('preserves VK live offset semantics', () => {
		const {player, adapter} = createAdapter();
		player.info.isLive$.setValue(true);
		player.info.duration$.setValue(-3600);

		adapter.seekLive(4_000);
		expect(player.lastSeekSeconds).toBe(-4);
		adapter.seekLive(7_200_000);
		expect(player.lastSeekSeconds).toBe(-3540);
		adapter.seekLive(0);
		expect(player.lastSeekSeconds).toBe(0);
	});

	it('rejects pending prepare on fatal VK error', async () => {
		const {player, adapter} = createAdapter();
		player.autoCanplay = false;
		const prepare = adapter.prepare(createPrepareRequest());
		const rejection = expect(prepare).rejects.toThrow('fatal fixture');

		player.events.fatalError$.next({message: 'fatal fixture'});

		await rejection;
	});

	it('selects VK for DASH only when VK is available', async () => {
		vi.stubGlobal('window', {VKCore: {Player: FakeVkPlayer}});
		const core = createDefaultCore();
		await core.open(createOpenRequest({
			source: createPrepareRequest().source,
			capabilities: {...fakeCapabilities, vkPlayer: true}
		}));

		expect(core.getSnapshot().engine?.type).toBe('vkplayer');
	});
});
