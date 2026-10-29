import {afterEach, describe, expect, it, vi} from 'vitest';
import {ShakaAdapter} from '../../packages/engines/shaka/src/shaka-adapter';
import {fakeCapabilities} from '../../packages/testing/src';

class FakeVideo extends EventTarget {
	controls = false;
	preload = '';
	playsInline = false;
	style: Partial<CSSStyleDeclaration> = {};
	muted = false;
	volume = 1;
	playbackRate = 1;
	currentTime = 0;
	duration = 10;
	readyState = 0;
	src = '';
	error = null;
	textTracks: TextTrack[] = [];
	seekable = {length: 1, start: () => 0, end: () => 10};
	load = vi.fn();
	remove = vi.fn();
	removeAttribute = vi.fn();
	setAttribute = vi.fn();
	play = vi.fn(async () => undefined);
	pause = vi.fn();
}

class FakeShakaPlayer {
	configure = vi.fn();
	attach = vi.fn(async () => undefined);
	load = vi.fn(async () => undefined);
	unload = vi.fn(async () => undefined);
	destroy = vi.fn(async () => undefined);
	addEventListener = vi.fn();
	selectVariantTrack = vi.fn();
	selectAudioLanguage = vi.fn();
	selectTextTrack = vi.fn();
	setTextTrackVisibility = vi.fn();
	private variants = [
		{id: 1, type: 'variant', active: false, height: 360, bandwidth: 800_000, language: 'en', audioId: 11},
		{id: 2, type: 'variant', active: true, height: 720, bandwidth: 2_500_000, language: 'en', audioId: 11}
	];
	private textTracks = [{id: 5, type: 'text', active: false, language: 'en', label: 'English'}];

	getVariantTracks() {
		return this.variants;
	}

	getTextTracks() {
		return this.textTracks;
	}
}

function createAdapter() {
	const video = new FakeVideo();
	video.readyState = 2;
	vi.stubGlobal('document', {createElement: () => video});
	vi.stubGlobal('HTMLMediaElement', {HAVE_METADATA: 1, HAVE_FUTURE_DATA: 2});
	const player = new FakeShakaPlayer();
	const adapter = new ShakaAdapter(() => player as never);
	const surface = {appendChild: vi.fn()};
	const prepare = adapter.prepare({
		source: {url: '/video.mpd', format: 'dash', variant: 'dashSep', mimeType: 'application/dash+xml'},
		surface: surface as unknown as HTMLElement,
		startPositionMs: 500,
		muted: true,
		capabilities: fakeCapabilities
	});
	return {adapter, player, video, surface, prepare};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ShakaAdapter', () => {
	it('configures a 10 second buffer and loads with start position', async () => {
		const {adapter, player, prepare} = createAdapter();
		await prepare;

		expect(player.configure).toHaveBeenCalledWith({
			streaming: {bufferingGoal: 10, bufferBehind: 2, rebufferingGoal: 2},
			abr: {enabled: true}
		});
		expect(player.load).toHaveBeenCalledWith('/video.mpd', 0.5);
		expect(adapter.getTechnicalSnapshot().engine.type).toBe('shaka');
	});

	it('clears the buffer after seek and on destroy', async () => {
		const {adapter, player, video, prepare} = createAdapter();
		await prepare;

		await adapter.seek(5_000);
		await adapter.destroy();

		expect(video.currentTime).toBe(5);
		expect(player.selectVariantTrack).toHaveBeenCalledWith(player.getVariantTracks()[1], true, 0);
		expect(player.unload).toHaveBeenCalledWith(false);
		expect(player.destroy).toHaveBeenCalledOnce();
		expect(video.remove).toHaveBeenCalledOnce();
	});

	it('switches quality, audio and text tracks', async () => {
		const {adapter, player, prepare} = createAdapter();
		await prepare;

		adapter.setQuality('360p');
		adapter.setQuality('Auto');
		adapter.setAudioTrack('11');
		adapter.setTextTrack('5');
		adapter.setTextTrack(null);

		expect(player.configure).toHaveBeenCalledWith('abr.enabled', false);
		expect(player.configure).toHaveBeenCalledWith('abr.enabled', true);
		expect(player.selectAudioLanguage).toHaveBeenCalledWith('en');
		expect(player.selectTextTrack).toHaveBeenCalledWith(player.getTextTracks()[0]);
		expect(player.setTextTrackVisibility).toHaveBeenLastCalledWith(false);
	});
});
