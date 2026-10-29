import type {PlaylistItem} from './playlist-item';
import type {DeviceCapabilities, PlaybackState, QualityType, TextTrack} from './playback';

export interface InitData {
	appVersion: string;
	uid: string;
	token: string;
	statsToken: string;
	isAnonymous: boolean;
	locale: string;
	host: string;
	proxyHost: string;
	node: HTMLDivElement;
	userId?: number;
	capabilities?: DeviceCapabilities;
}

export interface UpdateTokenParams {
	token: string;
	isAnonymous: boolean;
	userId?: number;
}

export interface BuildInfo {
	hash: string;
	branch: string;
	buildDate: string;
	packageVersion: string;
	packageName: string;
}

export interface PlaybackOptions {
	startPositionMs?: number;
	autoplay?: boolean;
	muted?: boolean;
}

export type ViewMode = 'fullscreen' | 'screencast';

export interface PlaybackStateInfo {
	playbackSpeed: number;
	quality: string | null;
	currentTime: number;
	subtitles: {
		current: TextTrack | null;
		available: readonly TextTrack[];
	};
}

export interface PublicPlayback {
	play(): Promise<void>;
	pause(): Promise<void>;
	togglePlayPause(): Promise<void>;
	seek(positionMs: number): Promise<void>;
	seekLive(offsetMs: number): Promise<void>;
	getState(): PlaybackState;
	setQuality(quality: QualityType, playbackRate?: number): Promise<void>;
	setAudioTrack(trackId: string): Promise<void>;
	setPlaybackRate(rate: number): Promise<void>;
	getId(): string | undefined;
	getTransitionState(): string;
	getCurrentQualityType(): QualityType;
	getVersion(): string;
	skipAdv(): Promise<void>;
	getStateInfo(): PlaybackStateInfo;
}

export interface IPlayerLib {
	init(data: InitData): Promise<void>;
	updateToken(params: UpdateTokenParams): Promise<void>;
	isInitialized(): boolean;
	getBuildInfo(): BuildInfo;
	waitInit(): Promise<void>;
	open(item: PlaylistItem, options?: PlaybackOptions): Promise<void>;
	reload(item: PlaylistItem, options?: PlaybackOptions): Promise<void>;
	shutdown(): Promise<void>;
	close(): Promise<void>;
	destroy(): Promise<void>;
	playPreview(
		wrapper: HTMLElement,
		loop: boolean,
		trailer: string,
		timelineThumbs: string[],
		onPreviewEnded?: () => void
	): Promise<void>;
	stopPreview(): Promise<void>;
	getPlaybackInterface(): PublicPlayback;
	setViewMode(mode: ViewMode): void;
	getViewMode(): ViewMode;
}
