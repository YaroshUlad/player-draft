import type {
	BuildInfo,
	InitData,
	IPlayerLib,
	PlaybackOptions,
	PublicPlayback,
	UpdateTokenParams,
	ViewMode
} from '../../contracts/src/public-api';
import type {PlayerExtension} from '../../contracts/src/extensions';
import type {AdCreative, LiveStatus, PlaylistItem, Scte35Action, TvProgrammeItem} from '../../contracts/src/playlist-item';
import type {DeviceCapabilities} from '../../contracts/src/playback';
import type {PlaybackCore} from '../../core/src/playback-core';
import {SourcePlanner} from '../../core/src/source-planner';
import {detectDeviceCapabilities} from '../../engines/native/src/detect-capabilities';
import {initializeVkPlayerSdk} from '../../engines/vk/src/vk-player';
import {AdsExtension} from '../../extensions/ads/src/ads-extension';
import {SubtitlesExtension} from '../../extensions/subtitles/src/subtitles-extension';
import type {HttpTransport} from '../../infrastructure/http/src/types';
import {LiveExtension} from '../../extensions/live/src/live-extension';
import {PlaylistExtension} from '../../extensions/playlist/src/playlist-extension';
import {RecoveryExtension} from '../../extensions/recovery/src/recovery-extension';
import {TvChannelExtension} from '../../extensions/tv-channel/src/tv-channel-extension';
import {createDefaultCore} from './create-default-core';
import {CustomEventBridge} from './custom-event-bridge';
import {CustomEventDispatcher} from './custom-event-dispatcher';
import {ExtensionHost} from './extension-host';
import {PreviewService} from './preview-service';
import {PublicPlaybackImpl} from './public-playback';

const DEFAULT_CAPABILITIES: DeviceCapabilities = {
	platform: 'unknown',
	native: true,
	vkPlayer: false,
	hlsJs: false,
	dashJs: false,
	mse: false,
	supportedMimeTypes: []
};

export interface PlayerDependencies {
	core?: PlaybackCore;
	sourcePlanner?: SourcePlanner;
	eventTarget?: EventTarget;
	extensions?: readonly PlayerExtension[];
	liveStatusProvider?: (item: PlaylistItem) => Promise<LiveStatus>;
	liveStatusPollIntervalMs?: number;
	tvProgrammeProvider?: (item: PlaylistItem) => Promise<readonly TvProgrammeItem[]>;
	tvServerTimeProvider?: () => Promise<number>;
	tvAdCreativeProvider?: (action: Scte35Action) => AdCreative;
	subtitlesHttpTransport?: HttpTransport;
	previewService?: PreviewService;
}

export class PlayerLib implements IPlayerLib {
	private readonly core: PlaybackCore;
	private readonly sourcePlanner: SourcePlanner;
	private readonly playback: PublicPlaybackImpl;
	private readonly extensionHost: ExtensionHost;
	private readonly previewService: PreviewService;
	private initPromise: Promise<void> = Promise.resolve();
	private initialized = false;
	private initData: InitData | null = null;
	private capabilities: DeviceCapabilities = DEFAULT_CAPABILITIES;
	private currentItem: PlaylistItem | null = null;
	private playbackSurface: HTMLElement | null = null;
	private operationCounter = 0;
	private viewMode: ViewMode = 'fullscreen';

	constructor(dependencies: PlayerDependencies = {}) {
		this.core = dependencies.core ?? createDefaultCore();
		this.sourcePlanner = dependencies.sourcePlanner ?? new SourcePlanner();
		this.previewService = dependencies.previewService ?? new PreviewService(createDefaultCore());
		const target = dependencies.eventTarget ?? document;
		const dispatcher = new CustomEventDispatcher(target);
		const subtitles = new SubtitlesExtension({
			dispatcher,
			...(dependencies.subtitlesHttpTransport ? {httpTransport: dependencies.subtitlesHttpTransport} : {})
		});
		const advertisement = new AdsExtension({
			core: this.core,
			getSurface: () => this.getPlaybackSurface(),
			getCapabilities: () => this.capabilities,
			dispatcher
		});
		this.extensionHost = new ExtensionHost(this.core, [
			...dependencies.extensions ?? [],
			new RecoveryExtension({
				sourcePlanner: this.sourcePlanner,
				getCapabilities: () => this.capabilities,
				dispatcher
			}),
			new LiveExtension({
				core: this.core,
				reload: (item, options) => this.open(item, options),
				dispatcher,
				...(dependencies.liveStatusProvider ? {getLiveStatus: dependencies.liveStatusProvider} : {}),
				...(dependencies.liveStatusPollIntervalMs !== undefined ?
					{intervalMs: dependencies.liveStatusPollIntervalMs} : {})
			}),
			subtitles,
			advertisement,
			new TvChannelExtension({
				ads: advertisement,
				dispatcher,
				...(dependencies.tvProgrammeProvider ? {getProgramme: dependencies.tvProgrammeProvider} : {}),
				...(dependencies.tvServerTimeProvider ? {getServerTime: dependencies.tvServerTimeProvider} : {}),
				...(dependencies.tvAdCreativeProvider ? {getAdCreative: dependencies.tvAdCreativeProvider} : {})
			}),
			new PlaylistExtension({open: (item, options) => this.open(item, options), dispatcher}),
			new CustomEventBridge(dispatcher)
		]);
		this.playback = new PublicPlaybackImpl(
			this.core,
			() => this.currentItem?.model.rawId,
			() => advertisement.skipAdv(),
			() => subtitles.getStateInfo()
		);
	}

	init(data: InitData): Promise<void> {
		this.initData = data;
		initializeVkPlayerSdk();
		this.capabilities = data.capabilities ?? detectDeviceCapabilities();
		this.initPromise = Promise.resolve()
			.then(() => this.extensionHost.init())
			.then(() => {
				this.initialized = true;
			});
		return this.initPromise;
	}

	async updateToken(params: UpdateTokenParams): Promise<void> {
		if (!params.token || params.isAnonymous === undefined) {
			throw new Error('Pass "token" and "isAnonymous" params into "updateToken" method');
		}
		await this.initPromise;
		if (this.initData) {
			this.initData = {
				...this.initData,
				token: params.token,
				isAnonymous: params.isAnonymous,
				...(params.userId !== undefined ? {userId: params.userId} : {})
			};
		}
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	getBuildInfo(): BuildInfo {
		return {
			hash: 'development',
			branch: 'local',
			buildDate: '',
			packageVersion: '0.1.0',
			packageName: 'vktv-player-draft'
		};
	}

	waitInit(): Promise<void> {
		return this.initPromise;
	}

	async open(item: PlaylistItem, options: PlaybackOptions = {}): Promise<void> {
		await this.initPromise;
		if (!this.initData) {
			throw new Error('Player must be initialized before open');
		}
		const source = this.sourcePlanner.getInitialSource(item.model.files, this.capabilities);
		const autoplay = options.autoplay ?? (
			item.playback.isAutoplay !== false && item.playback.isAutoplaySettingEnabled !== false
		);
		const startPositionMs = options.startPositionMs ?? item.playback.startPosition ?? item.playback.lastPosition ?? 0;
		const surface = this.getPlaybackSurface();

		await this.extensionHost.beforeOpen(item, options);
		await this.extensionHost.open(item, options, source, async (nextSource, recoveryPositionMs) => {
			await this.core.open({
				source: nextSource,
				surface,
				capabilities: this.capabilities,
				startPositionMs: recoveryPositionMs ?? startPositionMs,
				autoplay,
				muted: options.muted ?? false,
				operationId: `open-${++this.operationCounter}`,
				playbackKind: 'content'
			});
		});
		this.currentItem = item;
	}

	async reload(item: PlaylistItem, options: PlaybackOptions = {}): Promise<void> {
		await this.shutdown();
		await this.open(item, options);
	}

	async shutdown(): Promise<void> {
		await this.previewService.stop();
		await this.extensionHost.shutdown();
		await this.core.destroy();
		this.removePlaybackSurface();
		this.currentItem = null;
	}

	async close(): Promise<void> {
		await this.shutdown();
	}

	async destroy(): Promise<void> {
		await this.shutdown();
		await this.extensionHost.dispose();
		this.initialized = false;
		this.initData = null;
		this.initPromise = Promise.resolve();
	}

	async playPreview(
		wrapper: HTMLElement,
		loop: boolean,
		trailer: string,
		timelineThumbs: string[],
		onPreviewEnded?: () => void
	): Promise<void> {
		await this.initPromise;
		await this.previewService.play({
			wrapper,
			loop,
			trailer,
			timelineThumbs,
			...(onPreviewEnded ? {onPreviewEnded} : {})
		});
	}

	async stopPreview(): Promise<void> {
		await this.initPromise;
		await this.previewService.stop();
	}

	getPlaybackInterface(): PublicPlayback {
		return this.playback;
	}

	setViewMode(mode: ViewMode): void {
		this.viewMode = mode;
	}

	getViewMode(): ViewMode {
		return this.viewMode;
	}

	private getPlaybackSurface(): HTMLElement {
		if (this.playbackSurface) {
			return this.playbackSurface;
		}
		if (typeof document === 'undefined') {
			if (!this.initData) {
				throw new Error('Player must be initialized before creating a playback surface');
			}
			return this.initData.node;
		}

		const surface = document.createElement('div');
		surface.className = 'html5-video-container';
		surface.style.position = 'absolute';
		surface.style.left = '0';
		surface.style.top = '0';
		surface.style.width = '100%';
		surface.style.height = '100%';
		surface.style.overflow = 'hidden';
		surface.style.backgroundColor = 'black';
		document.body.insertBefore(surface, document.body.firstChild);
		this.playbackSurface = surface;
		return surface;
	}

	private removePlaybackSurface(): void {
		this.playbackSurface?.remove();
		this.playbackSurface = null;
	}
}
