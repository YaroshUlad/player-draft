import Hls from 'hls.js';
import type {HlsConfig} from 'hls.js';
import type {
	AdapterFactory,
	AdapterPrepareRequest,
	AdapterSnapshot,
	DeviceCapabilities,
	QualityType,
	Source
} from '../../../contracts/src/playback';
import {NativeHtml5Adapter} from '../../native/src/native-html5-adapter';

interface HlsErrorData {
	fatal: boolean;
	type: string;
	details: string;
	reason?: string;
}

export class HlsJsAdapter extends NativeHtml5Adapter {
	private hls: Hls | null = null;
	private requestedQuality: QualityType = 'Auto';

	constructor(private readonly hlsFactory: (config: Partial<HlsConfig>) => Hls = (config) => new Hls(config)) {
		super();
	}

	override async prepare(request: AdapterPrepareRequest): Promise<void> {
		if (this.video) {
			throw new Error('HLS adapter is already prepared');
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

		const config: Partial<HlsConfig> = {liveDurationInfinity: true};
		if (request.startPositionMs > 0) {
			config.startPosition = request.startPositionMs / 1000;
		}
		const hls = this.hlsFactory(config);
		this.hls = hls;
		hls.on(Hls.Events.ERROR, (_event, data) => this.onHlsError(data as HlsErrorData));
		hls.on(Hls.Events.LEVEL_SWITCHED, () => this.emit({type: 'qualityChange'}));
		hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => this.emit({type: 'tracksChange'}));
		hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, () => this.emit({type: 'tracksChange'}));
		hls.on(Hls.Events.MANIFEST_PARSED, () => {
			this.emit({type: 'qualityChange'});
			this.emit({type: 'tracksChange'});
		});
		hls.loadSource(request.source.url);
		hls.attachMedia(video);

		const clearCallbacks = (): void => {
			this.prepareResolve = null;
			this.prepareReject = null;
		};
		await new Promise<void>((resolve, reject) => {
			this.prepareResolve = resolve;
			this.prepareReject = reject;
		}).then(clearCallbacks, (error: unknown) => {
			clearCallbacks();
			throw error;
		});
	}

	override async destroy(): Promise<void> {
		if (this.hls) {
			this.hls.destroy();
			this.hls = null;
		}
		await super.destroy();
	}

	override getTechnicalSnapshot(): AdapterSnapshot {
		const snapshot = super.getTechnicalSnapshot();
		const levels = this.hls?.levels ?? [];
		const currentLevel = levels[this.hls?.currentLevel ?? -1];
		return {
			...snapshot,
			engine: {type: 'hlsjs', version: '1.0.5'},
			quality: {
				requested: this.requestedQuality,
				current: currentLevel?.height ? this.heightToQuality(currentLevel.height) : null,
				isAuto: this.requestedQuality === 'Auto',
				bitrate: currentLevel?.bitrate ?? null,
				available: [
					'Auto',
					...levels
						.map((level) => this.heightToQuality(level.height))
						.filter((quality): quality is QualityType => quality !== null)
				]
			},
			audioTracks: (this.hls?.audioTracks ?? []).map((track) => ({
				id: String(track.id),
				name: track.name ?? '',
				language: track.lang ?? '',
				isDefault: Boolean(track.default)
			})),
			textTracks: (this.hls?.subtitleTracks ?? []).map((track) => ({
				id: String(track.id),
				name: track.name ?? track.lang ?? String(track.id),
				language: track.lang ?? '',
				isAuto: false
			})),
			capabilities: {
				...snapshot.capabilities,
				quality: true,
				audioTracks: true,
				textTracks: true
			}
		};
	}

	override setQuality(quality: QualityType): void {
		const hls = this.hls;
		if (!hls) {
			throw new Error('HLS adapter is not prepared');
		}
		this.requestedQuality = quality;
		if (quality === 'Auto') {
			hls.currentLevel = -1;
		} else {
			const height = this.qualityToHeight(quality);
			const level = hls.levels.findIndex((item) => item.height === height);
			if (level < 0) {
				throw new Error(`Quality ${quality} is not available`);
			}
			hls.currentLevel = level;
		}
		this.emit({type: 'qualityChange'});
	}

	override setAudioTrack(trackId: string): void {
		if (!this.hls) {
			throw new Error('HLS adapter is not prepared');
		}
		this.hls.audioTrack = Number(trackId);
		this.emit({type: 'tracksChange'});
	}

	override setTextTrack(trackId: string | null): void {
		if (!this.hls) {
			throw new Error('HLS adapter is not prepared');
		}
		this.hls.subtitleTrack = trackId === null ? -1 : Number(trackId);
		this.emit({type: 'tracksChange'});
	}

	private onHlsError(data: HlsErrorData): void {
		if (!data.fatal) {
			return;
		}
		const message = ['HLS error', data.type, data.details, data.reason].filter(Boolean).join(' ');
		this.emit({
			type: 'error',
			error: {code: 'HLS_ERROR', message, fatal: true}
		});
	}

	private heightToQuality(height: number): QualityType | null {
		return `${height}p` as QualityType;
	}

	private qualityToHeight(quality: QualityType): number {
		return Number.parseInt(quality, 10);
	}
}

export class HlsJsAdapterFactory implements AdapterFactory {
	create(_source: Source, _capabilities: DeviceCapabilities): HlsJsAdapter {
		return new HlsJsAdapter();
	}
}
