import {afterEach, describe, expect, it, vi} from 'vitest';
import {NativeHtml5Adapter} from '../../packages/engines/native/src/native-html5-adapter';
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
	seekable = {
		length: 1,
		start: () => 0,
		end: () => 10
	};
	load = vi.fn();
	remove = vi.fn();
	removeAttribute = vi.fn();
	setAttribute = vi.fn();
	canPlayType = vi.fn((mimeType: string) => mimeType === 'video/mp4' ? 'probably' : '');

	play = vi.fn(async () => {
		this.dispatchEvent(new Event('playing'));
	});

	pause = vi.fn(() => {
		this.dispatchEvent(new Event('pause'));
	});
}

function createAdapter() {
	const video = new FakeVideo();
	vi.stubGlobal('document', {createElement: () => video});
	vi.stubGlobal('HTMLMediaElement', {HAVE_METADATA: 1});
	const surface = {appendChild: vi.fn()};
	const adapter = new NativeHtml5Adapter();
	const prepare = adapter.prepare({
		source: {url: '/video.mp4', format: 'mp4', variant: 'mp4720', mimeType: 'video/mp4'},
		surface: surface as unknown as HTMLElement,
		startPositionMs: 1_500,
		muted: true,
		capabilities: fakeCapabilities
	});
	return {adapter, video, surface, prepare};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('NativeHtml5Adapter', () => {
	it('prepares a controls-free video and applies start position', async () => {
		const {adapter, video, surface, prepare} = createAdapter();
		const events: string[] = [];
		adapter.subscribe((event) => events.push(event.type));
		video.readyState = 1;
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('canplay'));
		await prepare;

		expect(video.controls).toBe(false);
		expect(video.muted).toBe(true);
		expect(video.currentTime).toBe(1.5);
		expect(surface.appendChild).toHaveBeenCalledWith(video);
		expect(events).toContain('ready');
	});

	it('maps playback commands and native events', async () => {
		const {adapter, video, prepare} = createAdapter();
		video.dispatchEvent(new Event('canplay'));
		await prepare;

		await adapter.play();
		adapter.pause();
		adapter.seek(4_000);

		expect(video.play).toHaveBeenCalled();
		expect(video.pause).toHaveBeenCalled();
		expect(video.currentTime).toBe(4);
		expect(adapter.getTechnicalSnapshot().engine.type).toBe('native');
	});

	it('emits first bytes and first frame only once', async () => {
		const {adapter, video, prepare} = createAdapter();
		const events: string[] = [];
		adapter.subscribe((event) => events.push(event.type));
		video.dispatchEvent(new Event('canplay'));
		await prepare;

		video.dispatchEvent(new Event('progress'));
		video.dispatchEvent(new Event('progress'));
		video.dispatchEvent(new Event('loadeddata'));
		video.dispatchEvent(new Event('loadeddata'));

		expect(events.filter((event) => event === 'firstBytes')).toHaveLength(1);
		expect(events.filter((event) => event === 'firstFrame')).toHaveLength(1);
	});

	it('removes only its own video on destroy', async () => {
		const {adapter, video, surface, prepare} = createAdapter();
		video.dispatchEvent(new Event('canplay'));
		await prepare;

		await adapter.destroy();
		await adapter.destroy();

		expect(video.remove).toHaveBeenCalledTimes(1);
		expect(surface.appendChild).toHaveBeenCalledTimes(1);
		expect(() => adapter.pause()).toThrow('not prepared');
	});
});
