import type {
	AdapterEvent,
	AdapterFactory,
	AdapterPrepareRequest,
	AdapterSnapshot,
	DeviceCapabilities,
	PlaybackAdapter,
	QualityType,
	Source,
	TextTrack,
	Unsubscribe
} from '../../../contracts/src/playback';

export class NativeHtml5Adapter implements PlaybackAdapter {
	protected readonly listeners = new Set<(event: AdapterEvent) => void>();
	protected video: HTMLVideoElement | null = null;
	protected source: Source | null = null;
	protected startPositionMs = 0;
	protected startPositionApplied = false;
	protected firstBytesEmitted = false;
	protected firstFrameEmitted = false;
	protected destroyed = false;
	protected nativeBindings: {name: string; listener: EventListener}[] = [];
	protected prepareReject: ((error: Error) => void) | null = null;

	async prepare(request: AdapterPrepareRequest): Promise<void> {
		if (this.video) {
			throw new Error('Native adapter is already prepared');
		}

		this.source = request.source;
		this.startPositionMs = request.startPositionMs;
		this.startPositionApplied = request.startPositionMs === 0;
		const video = document.createElement('video');
		this.video = video;
		video.controls = false;
		video.preload = 'auto';
		video.playsInline = true;
		video.setAttribute('playsinline', '');
		video.muted = request.muted;
		this.bindNativeEvents(video);
		request.surface.appendChild(video);

		const clearPrepareCallbacks = (): void => {
			this.prepareResolve = null;
			this.prepareReject = null;
		};
		await new Promise<void>((resolve, reject) => {
			this.prepareResolve = resolve;
			this.prepareReject = reject;
			video.src = request.source.url;
			video.load();
		}).then(clearPrepareCallbacks, (error: unknown) => {
			clearPrepareCallbacks();
			throw error;
		});
	}

	async play(): Promise<void> {
		await this.getVideo().play();
	}

	pause(): void {
		this.getVideo().pause();
	}

	seek(positionMs: number): void {
		this.getVideo().currentTime = positionMs / 1000;
	}

	seekLive(offsetMs: number): void {
		const video = this.getVideo();
		const seekable = video.seekable;
		if (seekable.length === 0) {
			throw new Error('Live stream is not seekable');
		}
		const endMs = seekable.end(seekable.length - 1) * 1000;
		const startMs = seekable.start(0) * 1000;
		video.currentTime = Math.max(startMs, endMs - offsetMs) / 1000;
	}

	stop(): void {
		const video = this.getVideo();
		video.pause();
		if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
			video.currentTime = 0;
		}
		this.emit({type: 'idle', positionMs: 0});
	}

	async destroy(): Promise<void> {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		this.prepareReject?.(new Error('Native adapter was destroyed during prepare'));
		const video = this.video;
		if (video) {
			for (const binding of this.nativeBindings) {
				video.removeEventListener(binding.name, binding.listener);
			}
			this.nativeBindings = [];
			video.pause();
			video.removeAttribute('src');
			video.load();
			video.remove();
		}
		this.video = null;
		this.listeners.clear();
	}

	getTechnicalSnapshot(): AdapterSnapshot {
		const video = this.video;
		const durationMs = video && Number.isFinite(video.duration) ? video.duration * 1000 : 0;
		const isLive = Boolean(video && video.duration === Infinity);
		return {
			positionMs: video ? video.currentTime * 1000 : 0,
			durationMs: isLive ? 0 : durationMs,
			live: {
				isLive,
				offsetMs: null,
				seekableRanges: this.getSeekableRanges(video)
			},
			engine: {type: 'native', version: 'html5'},
			quality: {requested: 'Auto', current: null, isAuto: true, bitrate: null, available: ['Auto']},
			audioTracks: [],
			textTracks: this.getTextTracks(video),
			playbackRate: video?.playbackRate ?? 1,
			volume: video?.volume ?? 1,
			muted: video?.muted ?? false,
			capabilities: {
				seek: true,
				seekLive: true,
				quality: false,
				audioTracks: false,
				textTracks: true,
				playbackRate: true,
				volume: true
			}
		};
	}

	setQuality(quality: QualityType): void {
		if (quality !== 'Auto') {
			throw new Error('Manual quality selection requires a source reopen or an adaptive adapter');
		}
	}

	setAudioTrack(_trackId: string): void {
		throw new Error('Audio track selection is not available in the native HTML5 adapter');
	}

	setTextTrack(trackId: string | null): void {
		const video = this.getVideo();
		for (const track of Array.from(video.textTracks)) {
			track.mode = trackId !== null && track.id === trackId ? 'showing' : 'disabled';
		}
		this.emit({type: 'tracksChange'});
	}

	setPlaybackRate(rate: number): void {
		this.getVideo().playbackRate = rate;
		this.emit({type: 'rateChange'});
	}

	setVolume(volume: number): void {
		this.getVideo().volume = volume;
		this.emit({type: 'volumeChange'});
	}

	setMuted(muted: boolean): void {
		this.getVideo().muted = muted;
		this.emit({type: 'volumeChange'});
	}

	subscribe(listener: (event: AdapterEvent) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	protected getVideo(): HTMLVideoElement {
		if (!this.video || this.destroyed) {
			throw new Error('Native adapter is not prepared');
		}
		return this.video;
	}

	protected bindNativeEvents(video: HTMLVideoElement): void {
		const names = [
			'loadstart', 'canplay', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'ended',
			'timeupdate', 'progress', 'loadedmetadata', 'loadeddata', 'error', 'volumechange', 'ratechange'
		];
		for (const name of names) {
			const listener = (): void => this.onNativeEvent(name);
			video.addEventListener(name, listener);
			this.nativeBindings.push({name, listener});
		}
	}

	protected onNativeEvent(name: string): void {
		if (this.destroyed) {
			return;
		}
		switch (name) {
			case 'loadstart':
				this.emit({type: 'loading'});
				break;
			case 'canplay':
				this.applyStartPosition();
				this.emit({type: 'ready'});
				this.prepareResolve?.();
				this.prepareResolve = null;
				break;
			case 'playing':
			case 'pause':
			case 'waiting':
			case 'seeking':
			case 'seeked':
			case 'ended':
				this.emit({type: name === 'pause' ? 'paused' : name});
				break;
			case 'timeupdate':
				this.emit({type: 'timeUpdate'});
				break;
			case 'progress':
				if (!this.firstBytesEmitted) {
					this.firstBytesEmitted = true;
					this.emit({type: 'firstBytes'});
				}
				break;
			case 'loadedmetadata':
				this.applyStartPosition();
				break;
			case 'loadeddata':
				this.applyStartPosition();
				if (!this.firstFrameEmitted) {
					this.firstFrameEmitted = true;
					this.emit({type: 'firstFrame'});
				}
				break;
			case 'error': {
				const error = this.createMediaError();
				this.prepareReject?.(error);
				this.prepareResolve = null;
				this.emit({type: 'error', error: {code: 'MEDIA_ERROR', message: error.message, fatal: true, cause: error}});
				break;
			}
			case 'volumechange':
				this.emit({type: 'volumeChange'});
				break;
			case 'ratechange':
				this.emit({type: 'rateChange'});
				break;
		}
	}

	protected prepareResolve: (() => void) | null = null;

	protected applyStartPosition(): void {
		if (this.startPositionApplied || !this.video || this.video.readyState < HTMLMediaElement.HAVE_METADATA) {
			return;
		}
		if (Number.isFinite(this.video.duration)) {
			this.video.currentTime = Math.min(this.startPositionMs / 1000, this.video.duration);
		} else {
			this.video.currentTime = this.startPositionMs / 1000;
		}
		this.startPositionApplied = true;
	}

	protected createMediaError(): Error {
		const mediaError = this.video?.error;
		const messages: Record<number, string> = {
			1: 'Media loading was aborted',
			2: 'A network error interrupted media loading',
			3: 'Media decoding failed',
			4: 'Media source is not supported'
		};
		return new Error(messages[mediaError?.code ?? 0] ?? 'Unknown native media error');
	}

	protected getSeekableRanges(video: HTMLVideoElement | null): {startMs: number; endMs: number}[] {
		if (!video) {
			return [];
		}
		const ranges: {startMs: number; endMs: number}[] = [];
		for (let index = 0; index < video.seekable.length; index++) {
			ranges.push({startMs: video.seekable.start(index) * 1000, endMs: video.seekable.end(index) * 1000});
		}
		return ranges;
	}

	protected getTextTracks(video: HTMLVideoElement | null): TextTrack[] {
		if (!video) {
			return [];
		}
		return Array.from(video.textTracks).map((track, index) => ({
			id: track.id || String(index),
			name: track.label || track.language || String(index),
			language: track.language,
			isAuto: false
		}));
	}

	protected emit(event: AdapterEvent): void {
		if (this.destroyed) {
			return;
		}
		const positionMs = this.video ? this.video.currentTime * 1000 : 0;
		const duration = this.video?.duration;
		const enriched: AdapterEvent = {
			...event,
			positionMs: event.positionMs ?? positionMs,
			...(duration !== undefined && Number.isFinite(duration) ? {durationMs: duration * 1000} : {})
		};
		for (const listener of this.listeners) {
			listener(enriched);
		}
	}
}

export class NativeHtml5AdapterFactory implements AdapterFactory {
	create(_source: Source, _capabilities: DeviceCapabilities): NativeHtml5Adapter {
		return new NativeHtml5Adapter();
	}
}
