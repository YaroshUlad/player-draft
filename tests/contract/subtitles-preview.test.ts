import {describe, expect, it, vi} from 'vitest';
import {PlaybackCore} from '../../packages/core/src/playback-core';
import type {HttpRequest, HttpResponse} from '../../packages/infrastructure/http/src/types';
import {PlayerLib} from '../../packages/sdk/src/player-lib';
import {PreviewService} from '../../packages/sdk/src/preview-service';
import {FakeAdapterFactory, fakeCapabilities, fakePlaylistItem} from '../../packages/testing/src';

const VTT = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello

00:00:02.000 --> 00:00:04.000
World`;

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

describe('SubtitlesExtension', () => {
	it('loads VTT and exposes cues and subtitle state', async () => {
		const factory = new FakeAdapterFactory();
		const eventTarget = new EventTarget();
		const httpTransport = {
			request: async (_request: HttpRequest): Promise<HttpResponse> => ({
				status: 200,
				statusText: 'OK',
				body: VTT
			})
		};
		const player = new PlayerLib({
			core: new PlaybackCore(factory),
			eventTarget,
			subtitlesHttpTransport: httpTransport
		});
		const cues: unknown[] = [];
		eventTarget.addEventListener('player-subtitle-cue', (event) => {
			cues.push((event as CustomEvent).detail);
		});
		await initPlayer(player);
		await player.open({
			...fakePlaylistItem,
			model: {
				...fakePlaylistItem.model,
				subtitles: [{id: 'en', name: 'English', language: 'en', url: '/subtitles.vtt', isDefault: true}]
			}
		});

		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 1_500});
		factory.adapters[0]?.emit({type: 'timeUpdate', positionMs: 2_500});

		expect(cues).toEqual([
			{trackId: 'en', text: 'Hello', startMs: 1_000, endMs: 2_000},
			{trackId: 'en', text: 'World', startMs: 2_000, endMs: 4_000}
		]);
		expect(player.getPlaybackInterface().getStateInfo().subtitles.current?.id).toBe('en');
		expect(player.getPlaybackInterface().getStateInfo().subtitles.available).toHaveLength(1);
	});
});

describe('PreviewService', () => {
	it('plays a trailer and calls back on ended', async () => {
		const factory = new FakeAdapterFactory();
		const previewService = new PreviewService(new PlaybackCore(factory), () => fakeCapabilities);
		const player = new PlayerLib({previewService, eventTarget: new EventTarget()});
		await initPlayer(player);
		const onEnded = vi.fn();

		await player.playPreview({} as HTMLElement, false, 'https://media.test/preview.mp4', [], onEnded);
		factory.adapters[0]?.emit({type: 'ended'});

		expect(onEnded).toHaveBeenCalledTimes(1);
	});

	it('reopens a looping preview and stops it', async () => {
		const factory = new FakeAdapterFactory();
		const previewService = new PreviewService(new PlaybackCore(factory), () => fakeCapabilities);
		const player = new PlayerLib({previewService, eventTarget: new EventTarget()});
		await initPlayer(player);
		const onEnded = vi.fn();
		await player.playPreview({} as HTMLElement, true, 'https://media.test/preview.mp4', [], onEnded);

		factory.adapters[0]?.emit({type: 'ended'});
		await vi.waitFor(() => expect(factory.adapters).toHaveLength(2));
		await player.stopPreview();

		expect(onEnded).not.toHaveBeenCalled();
	});

	it('rejects thumbnail-only preview explicitly', async () => {
		const previewService = new PreviewService(new PlaybackCore(new FakeAdapterFactory()), () => fakeCapabilities);
		const player = new PlayerLib({previewService, eventTarget: new EventTarget()});
		await initPlayer(player);

		await expect(player.playPreview({} as HTMLElement, false, '', ['thumb.jpg'])).rejects.toThrow(
			'thumbnail-only preview is not implemented'
		);
	});
});
