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
} from '../../../contracts/src/playback';
import {createGlobalVkPlayer} from './vk-player';
import type {VkError, VkPlayer, VkSource, VkSubscription} from './vk-player';

const QUALITY_TYPES: readonly QualityType[] = [
	'Auto', '4320p', '2160p', '1440p', '1080p', '720p', '576p', '480p', '360p', '270p', '240p', '144p'
];

const FORMAT_BY_VARIANT: Record<string, string> = {
	dashUni: 'DASH',
	dashSep: 'DASH_SEP',
	dashWebm: 'DASH_WEBM',
	dashStreams: 'DASH_STREAMS',
	dashOndemand: 'DASH_ONDEMAND',
	dashLivePlayback: 'DASH_LIVE',
	cmaf: 'DASH_LIVE_CMAF'
};

export class VkPlayerAdapter implements PlaybackAdapter {
	private readonly listeners = new Set<(event: AdapterEvent) => void>();
	private readonly subscriptions: VkSubscription[] = [];
	private prepareResolve: (() => void) | null = null;
	private prepareReject: ((error: Error) => void) | null = null;
	private destroyed = false;

	constructor(private readonly player: VkPlayer) {
		this.bindPlayerEvents();
	}

	async prepare(request: AdapterPrepareRequest): Promise<void> {
		const format = FORMAT_BY_VARIANT[request.source.variant] ?? 'DASH_SEP';
		const source: VkSource = {type: 'url', url: request.source.url, compatibilityMode: true};
		const clearCallbacks = (): void => {
			this.prepareResolve = null;
			this.prepareReject = null;
		};
		await new Promise<void>((resolve, reject) => {
			this.prepareResolve = resolve;
			this.prepareReject = reject;
			this.player.initVideo({
				container: request.surface,
				sources: {[format]: source},
				...(request.source.failoverHost ? {failoverHosts: [request.source.failoverHost]} : {}),
				isMuted: request.muted
			});
			if (request.startPositionMs > 0) {
				this.seek(request.startPositionMs);
			}
			this.player.prepare();
		}).then(clearCallbacks, (error: unknown) => {
			clearCallbacks();
			throw error;
		});
	}

	play(): void {
		this.player.play();
	}

	pause(): void {
		this.player.pause();
	}

	seek(positionMs: number): void {
		if (this.player.info.isLive$.getValue()) {
			this.seekLive(positionMs);
			return;
		}
		this.player.seekTime(Math.round(positionMs / 1000));
	}

	seekLive(offsetMs: number): void {
		let seekSeconds = offsetMs === 0 ? 0 : -Math.round(offsetMs / 1000);
		const duration = this.player.info.duration$.getValue();
		if (seekSeconds !== 0 && seekSeconds <= duration) {
			seekSeconds = duration + 60;
		}
		this.player.seekTime(seekSeconds);
	}

	stop(): void {
		this.player.stop();
	}

	async destroy(): Promise<void> {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		this.prepareReject?.(new Error('VK Player adapter was destroyed during prepare'));
		for (const subscription of this.subscriptions) {
			subscription.unsubscribe();
		}
		this.player.destroy();
		this.listeners.clear();
	}

	getTechnicalSnapshot(): AdapterSnapshot {
		const info = this.player.info;
		const currentQuality = this.normalizeQuality(info.currentQuality$.getValue());
		const isAuto = info.isAutoQualityEnabled$.getValue();
		const available = info.availableQualities$.getValue()
			.map((quality) => this.normalizeQuality(quality))
			.filter((quality): quality is QualityType => quality !== null);
		const currentAudio = info.currentAudioStream$.getValue();
		const bitrate = info.videoBitrate$.getValue();
		return {
			positionMs: info.position$.getValue() * 1000,
			durationMs: this.getDurationMs(),
			live: {
				isLive: Boolean(info.isLive$.getValue()),
				offsetMs: null,
				seekableRanges: []
			},
			engine: {type: 'vkplayer', version: 'vk-core'},
			quality: {
				requested: isAuto ? 'Auto' : currentQuality ?? 'Auto',
				current: currentQuality,
				isAuto,
				bitrate: bitrate === undefined ? null : bitrate * 1000,
				available: ['Auto', ...available]
			},
			audioTracks: info.availableAudioStreams$.getValue().map((track) => ({
				id: track.id,
				name: track.label ?? '',
				language: track.language ?? '',
				isDefault: track.id === currentAudio?.id || Boolean(track.isDefault)
			})),
			textTracks: info.availableTextTracks$.getValue().map((track) => ({
				id: track.id,
				name: track.label ?? track.language ?? track.id,
				language: track.language ?? '',
				...(track.url ? {url: track.url} : {}),
				isAuto: Boolean(track.isAuto)
			})),
			playbackRate: info.currentPlaybackRate$.getValue(),
			volume: info.volume$.getValue(),
			muted: info.muted$.getValue(),
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
	}

	setQuality(quality: QualityType): void {
		if (quality === 'Auto') {
			this.player.setAutoQuality(true);
			return;
		}
		this.player.setQuality(quality);
		this.player.setAutoQuality(false);
	}

	setAudioTrack(trackId: string): void {
		const track = this.player.info.availableAudioStreams$.getValue().find((item) => item.id === trackId);
		if (!track) {
			throw new Error(`Audio track ${trackId} is not available`);
		}
		this.player.setAudioStream(track);
	}

	setTextTrack(trackId: string | null): void {
		this.player.selectTextTrack(trackId ?? undefined);
	}

	setPlaybackRate(rate: number): void {
		this.player.setPlaybackRate(rate);
	}

	setVolume(volume: number): void {
		this.player.setVolume(volume);
	}

	setMuted(muted: boolean): void {
		this.player.setMuted(muted, true);
	}

	subscribe(listener: (event: AdapterEvent) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private bindPlayerEvents(): void {
		const events = this.player.events;
		this.subscriptions.push(
			events.canplay$.subscribe(() => {
				this.emit({type: 'ready'});
				this.prepareResolve?.();
				this.prepareResolve = null;
			}),
			events.playing$.subscribe(() => this.emit({type: 'playing'})),
			events.paused$.subscribe(() => this.emit({type: 'paused'})),
			events.stopped$.subscribe(() => this.emit({type: 'idle'})),
			events.ended$.subscribe(() => this.emit({type: 'ended'})),
			events.willSeek$.subscribe(() => this.emit({type: 'seeking'})),
			events.seeked$.subscribe(() => this.emit({type: 'seeked'})),
			events.firstBytes$.subscribe(() => this.emit({type: 'firstBytes'})),
			events.firstFrame$.subscribe(() => this.emit({type: 'firstFrame'})),
			events.fatalError$.subscribe((error) => this.onFatalError(error))
		);

		const info = this.player.info;
		this.subscriptions.push(
			info.position$.subscribe((position) => this.emit({type: 'timeUpdate', positionMs: position * 1000})),
			info.currentQuality$.subscribe(() => this.emit({type: 'qualityChange'})),
			info.availableQualities$.subscribe(() => this.emit({type: 'qualityChange'})),
			info.availableAudioStreams$.subscribe(() => this.emit({type: 'tracksChange'})),
			info.availableTextTracks$.subscribe(() => this.emit({type: 'tracksChange'})),
			info.currentTextTrack$.subscribe(() => this.emit({type: 'tracksChange'})),
			info.currentPlaybackRate$.subscribe(() => this.emit({type: 'rateChange'})),
			info.volume$.subscribe(() => this.emit({type: 'volumeChange'})),
			info.muted$.subscribe(() => this.emit({type: 'volumeChange'})),
			info.isBuffering$.subscribe((isBuffering) => {
				if (isBuffering) {
					this.emit({type: 'waiting'});
				}
			})
		);
	}

	private onFatalError(error: VkError): void {
		const thrown = error.thrown ?? new Error(error.message ?? 'VK Player fatal error');
		this.prepareReject?.(thrown);
		this.prepareReject = null;
		this.emit({
			type: 'error',
			error: {code: 'VK_PLAYER_FATAL', message: thrown.message, fatal: true, cause: thrown}
		});
	}

	private getDurationMs(): number {
		const duration = this.player.info.duration$.getValue();
		return Number.isFinite(duration) && duration > 0 ? duration * 1000 : 0;
	}

	private normalizeQuality(quality: string | undefined): QualityType | null {
		return quality && QUALITY_TYPES.includes(quality as QualityType) && quality !== 'Auto'
			? quality as QualityType
			: null;
	}

	private emit(event: AdapterEvent): void {
		if (this.destroyed) {
			return;
		}
		for (const listener of this.listeners) {
			listener(event);
		}
	}
}

export class VkPlayerAdapterFactory implements AdapterFactory {
	constructor(private readonly createPlayer: () => VkPlayer = createGlobalVkPlayer) {}

	create(_source: Source, _capabilities: DeviceCapabilities): VkPlayerAdapter {
		return new VkPlayerAdapter(this.createPlayer());
	}
}
