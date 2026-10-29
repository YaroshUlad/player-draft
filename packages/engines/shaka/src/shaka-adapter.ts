import shaka from 'shaka-player';
import type {
	AdapterFactory,
	AdapterPrepareRequest,
	AdapterSnapshot,
	DeviceCapabilities,
	QualityType,
	Source
} from '../../../contracts/src/playback';
import {NativeHtml5Adapter} from '../../native/src/native-html5-adapter';

type ShakaTrack = shaka.extern.Track;

export class ShakaAdapter extends NativeHtml5Adapter {
	private player: shaka.Player | null = null;
	private requestedQuality: QualityType = 'Auto';

	constructor(private readonly playerFactory: () => shaka.Player = () => new shaka.Player()) {
		super();
	}

	override async prepare(request: AdapterPrepareRequest): Promise<void> {
		if (this.video) {
			throw new Error('Shaka adapter is already prepared');
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

		const player = this.playerFactory();
		this.player = player;
		player.configure({
			streaming: {
				bufferingGoal: 10,
				bufferBehind: 2,
				rebufferingGoal: 2
			},
			abr: {enabled: true}
		});
		player.addEventListener('error', (event) => this.onShakaError(event));
		await player.attach(video);
		await player.load(request.source.url, request.startPositionMs / 1000);
		if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
			return;
		}
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

	override async seek(positionMs: number): Promise<void> {
		super.seek(positionMs);
		this.clearBufferAfterSeek();
	}

	override async seekLive(offsetMs: number): Promise<void> {
		super.seekLive(offsetMs);
		this.clearBufferAfterSeek();
	}

	override async destroy(): Promise<void> {
		if (this.player) {
			await this.player.unload(false);
			await this.player.destroy();
			this.player = null;
		}
		await super.destroy();
	}

	override getTechnicalSnapshot(): AdapterSnapshot {
		const snapshot = super.getTechnicalSnapshot();
		const variants = this.getVariantTracks();
		const active = variants.find((track) => track.active);
		return {
			...snapshot,
			engine: {type: 'shaka', version: '5.3.2'},
			quality: {
				requested: this.requestedQuality,
				current: active?.height ? `${active.height}p` as QualityType : null,
				isAuto: this.requestedQuality === 'Auto',
				bitrate: active?.bandwidth ?? null,
				available: [
					'Auto',
					...variants
						.filter((track) => track.height !== undefined)
						.map((track) => `${track.height}p` as QualityType)
				]
			},
			audioTracks: variants.map((track) => ({
				id: String(track.audioId ?? track.id),
				name: track.label ?? track.language ?? String(track.id),
				language: track.language ?? '',
				isDefault: Boolean(track.active)
			})),
			textTracks: (this.player?.getTextTracks() ?? []).map((track) => ({
				id: String(track.id),
				name: track.label ?? track.language ?? String(track.id),
				language: track.language ?? '',
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
		const player = this.player;
		if (!player) {
			throw new Error('Shaka adapter is not prepared');
		}
		this.requestedQuality = quality;
		if (quality === 'Auto') {
			player.configure('abr.enabled', true);
			this.emit({type: 'qualityChange'});
			return;
		}
		const height = Number.parseInt(quality, 10);
		const track = this.getVariantTracks().find((item) => item.height === height);
		if (!track) {
			throw new Error(`Quality ${quality} is not available`);
		}
		player.configure('abr.enabled', false);
		player.selectVariantTrack(track, true, 0);
		this.emit({type: 'qualityChange'});
	}

	override setAudioTrack(trackId: string): void {
		const player = this.player;
		const track = this.getVariantTracks().find((item) => String(item.audioId ?? item.id) === trackId);
		if (!player || !track?.language) {
			throw new Error(`Audio track ${trackId} is not available`);
		}
		player.selectAudioLanguage(track.language);
		this.emit({type: 'tracksChange'});
	}

	override setTextTrack(trackId: string | null): void {
		const player = this.player;
		if (!player) {
			throw new Error('Shaka adapter is not prepared');
		}
		if (trackId === null) {
			player.setTextTrackVisibility(false);
		} else {
			const track = player.getTextTracks().find((item) => String(item.id) === trackId);
			if (!track) {
				throw new Error(`Text track ${trackId} is not available`);
			}
			player.selectTextTrack(track);
			player.setTextTrackVisibility(true);
		}
		this.emit({type: 'tracksChange'});
	}

	private getVariantTracks(): ShakaTrack[] {
		return (this.player?.getVariantTracks() ?? []) as ShakaTrack[];
	}

	private clearBufferAfterSeek(): void {
		const active = this.getVariantTracks().find((track) => track.active);
		if (active) {
			this.player?.selectVariantTrack(active, true, 0);
		}
	}

	private onShakaError(event: unknown): void {
		const detail = (event as {detail?: {code?: number; message?: string; severity?: number}}).detail;
		const message = detail?.message ?? `Shaka error ${detail?.code ?? 'unknown'}`;
		this.prepareReject?.(new Error(message));
		this.emit({
			type: 'error',
			error: {
				code: `SHAKA_${detail?.code ?? 'UNKNOWN'}`,
				message,
				fatal: detail?.severity === shaka.util.Error.Severity.CRITICAL
			}
		});
	}
}

export class ShakaAdapterFactory implements AdapterFactory {
	create(_source: Source, _capabilities: DeviceCapabilities): ShakaAdapter {
		shaka.polyfill.installAll();
		return new ShakaAdapter();
	}
}
