import type {
	AdapterEvent,
	AdapterFactory,
	AdapterPrepareRequest,
	AdapterSnapshot,
	DeviceCapabilities,
	PlaybackAdapter,
	QualityType,
	Source,
	Unsubscribe
} from '../../contracts/src/playback';

export class FakeAdapter implements PlaybackAdapter {
	private readonly listeners = new Set<(event: AdapterEvent) => void>();
	private snapshot: AdapterSnapshot = {
		positionMs: 0,
		durationMs: 60_000,
		live: {isLive: false, offsetMs: null, seekableRanges: []},
		engine: {type: 'fake', version: '1.0.0'},
		quality: {requested: 'Auto', current: '720p', isAuto: true, bitrate: 2_500_000, available: ['Auto', '1080p', '720p']},
		audioTracks: [{id: 'default', name: 'Default', language: 'und', isDefault: true}],
		textTracks: [],
		playbackRate: 1,
		volume: 1,
		muted: false,
		capabilities: {
			seek: true,
			seekLive: true,
			quality: true,
			audioTracks: true,
			textTracks: true,
			playbackRate: true,
			volume: true
		}
	};
	private prepareGate: Promise<void> | null = null;
	private prepareError: Error | null = null;

	async prepare(request: AdapterPrepareRequest): Promise<void> {
		this.snapshot.positionMs = request.startPositionMs;
		this.snapshot.muted = request.muted;
		if (this.prepareGate) {
			await this.prepareGate;
		}
		if (this.prepareError) {
			const error = this.prepareError;
			this.emit({type: 'error', error: {code: 'FAKE_PREPARE_ERROR', message: error.message, fatal: true}});
			throw error;
		}
		this.emit({type: 'ready', positionMs: this.snapshot.positionMs});
	}

	play(): void {
		this.emit({type: 'playing'});
	}

	pause(): void {
		this.emit({type: 'paused'});
	}

	seek(positionMs: number): void {
		this.snapshot.positionMs = positionMs;
		this.emit({type: 'seeking', positionMs});
		this.emit({type: 'seeked', positionMs});
	}

	seekLive(offsetMs: number): void {
		this.snapshot.live = {...this.snapshot.live, isLive: true, offsetMs};
		this.emit({type: 'seeking'});
		this.emit({type: 'seeked'});
	}

	stop(): void {
		this.emit({type: 'idle'});
	}

	async destroy(): Promise<void> {
		this.emit({type: 'destroyed'});
	}

	getTechnicalSnapshot(): AdapterSnapshot {
		return {
			...this.snapshot,
			live: {...this.snapshot.live, seekableRanges: [...this.snapshot.live.seekableRanges]},
			engine: {...this.snapshot.engine},
			quality: {...this.snapshot.quality, available: [...this.snapshot.quality.available]},
			audioTracks: [...this.snapshot.audioTracks],
			textTracks: [...this.snapshot.textTracks],
			capabilities: {...this.snapshot.capabilities}
		};
	}

	setQuality(quality: QualityType): void {
		this.snapshot.quality = {
			...this.snapshot.quality,
			requested: quality,
			current: quality === 'Auto' ? this.snapshot.quality.current : quality,
			isAuto: quality === 'Auto'
		};
		this.emit({type: 'qualityChange'});
	}

	setAudioTrack(trackId: string): void {
		this.snapshot.audioTracks = this.snapshot.audioTracks.map((track) => ({
			...track,
			isDefault: track.id === trackId
		}));
		this.emit({type: 'tracksChange'});
	}

	setTextTrack(trackId: string | null): void {
		this.snapshot.textTracks = this.snapshot.textTracks.map((track) => ({
			...track,
			isAuto: track.id === trackId
		}));
		this.emit({type: 'tracksChange'});
	}

	setPlaybackRate(rate: number): void {
		this.snapshot.playbackRate = rate;
		this.emit({type: 'rateChange'});
	}

	setVolume(volume: number): void {
		this.snapshot.volume = volume;
		this.emit({type: 'volumeChange'});
	}

	setMuted(muted: boolean): void {
		this.snapshot.muted = muted;
		this.emit({type: 'volumeChange'});
	}

	subscribe(listener: (event: AdapterEvent) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	deferPrepare(): () => void {
		let resolve = (): void => undefined;
		this.prepareGate = new Promise<void>((promiseResolve) => {
			resolve = promiseResolve;
		});
		return () => resolve();
	}

	failPrepare(error: Error): void {
		this.prepareError = error;
	}

	emit(event: AdapterEvent): void {
		if (event.positionMs !== undefined) {
			this.snapshot.positionMs = event.positionMs;
		}
		if (event.durationMs !== undefined) {
			this.snapshot.durationMs = event.durationMs;
		}
		for (const listener of this.listeners) {
			listener(event);
		}
	}
}

export class FakeAdapterFactory implements AdapterFactory {
	readonly adapters: FakeAdapter[] = [];

	create(source: Source, capabilities: DeviceCapabilities): FakeAdapter {
		void source;
		void capabilities;
		const adapter = new FakeAdapter();
		this.adapters.push(adapter);
		return adapter;
	}
}
