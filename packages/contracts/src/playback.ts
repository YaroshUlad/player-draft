export type PlaybackState =
	| 'idle'
	| 'loading'
	| 'ready'
	| 'playing'
	| 'paused'
	| 'waiting'
	| 'seeking'
	| 'ended'
	| 'error'
	| 'destroyed';

export type QualityType =
	| 'Auto'
	| '4320p'
	| '2160p'
	| '1440p'
	| '1080p'
	| '720p'
	| '576p'
	| '480p'
	| '360p'
	| '270p'
	| '240p'
	| '144p';

export type MediaFormat = 'mp4' | 'hls' | 'dash' | 'cmaf';
export type PlaybackKind = 'content' | 'advertisement';
export type CommandInitiator = 'host' | 'sdk' | 'recovery' | 'advertisement' | 'interactive';
export type Unsubscribe = () => void;

export interface Source {
	url: string;
	format: MediaFormat;
	variant: string;
	mimeType: string;
	quality?: QualityType;
	failoverHost?: string;
}

export interface MediaFiles {
	mp4144?: string;
	mp4240?: string;
	mp4360?: string;
	mp4480?: string;
	mp4720?: string;
	mp41080?: string;
	mp41440?: string;
	mp42160?: string;
	hls?: string;
	hlsStreams?: string;
	hlsOndemand?: string;
	hlsLive?: string;
	hlsLivePlayback?: string;
	dashSep?: string;
	dashUni?: string;
	dashWebm?: string;
	dashStreams?: string;
	dashOndemand?: string;
	dashLivePlayback?: string;
	cmaf?: string;
	failoverHost?: string;
}

export interface DeviceCapabilities {
	platform: string;
	native: boolean;
	vkPlayer: boolean;
	dashJs: boolean;
	mse: boolean;
	supportedMimeTypes: readonly string[];
}

export interface PlaybackCapabilities {
	seek: boolean;
	seekLive: boolean;
	quality: boolean;
	audioTracks: boolean;
	textTracks: boolean;
	playbackRate: boolean;
	volume: boolean;
}

export interface EngineSnapshot {
	type: 'native' | 'vkplayer' | 'dashjs' | 'shaka' | 'fake';
	version: string;
}

export interface QualitySnapshot {
	requested: QualityType;
	current: QualityType | null;
	isAuto: boolean;
	bitrate: number | null;
	available: readonly QualityType[];
}

export interface LiveSnapshot {
	isLive: boolean;
	offsetMs: number | null;
	seekableRanges: readonly {startMs: number; endMs: number}[];
}

export interface PlaybackSnapshot {
	sessionId: string | null;
	mediaEpoch: number;
	state: PlaybackState;
	positionMs: number;
	durationMs: number;
	live: LiveSnapshot;
	source: Source | null;
	engine: EngineSnapshot | null;
	quality: QualitySnapshot;
	audioTracks: readonly AudioTrack[];
	textTracks: readonly TextTrack[];
	playbackRate: number;
	volume: number;
	muted: boolean;
	capabilities: PlaybackCapabilities;
}

export interface AudioTrack {
	id: string;
	name: string;
	language: string;
	isDefault: boolean;
}

export interface TextTrack {
	id: string;
	name: string;
	language: string;
	url?: string;
	isAuto: boolean;
}

export interface AdapterSnapshot {
	positionMs: number;
	durationMs: number;
	live: LiveSnapshot;
	engine: EngineSnapshot;
	quality: QualitySnapshot;
	audioTracks: readonly AudioTrack[];
	textTracks: readonly TextTrack[];
	playbackRate: number;
	volume: number;
	muted: boolean;
	capabilities: PlaybackCapabilities;
}

export interface PlaybackErrorInfo {
	code: string;
	message: string;
	fatal: boolean;
	cause?: unknown;
}

export type AdapterEventType =
	| 'idle'
	| 'willPlay'
	| 'willPause'
	| 'willSeek'
	| 'willStop'
	| 'loading'
	| 'ready'
	| 'playing'
	| 'paused'
	| 'waiting'
	| 'seeking'
	| 'seeked'
	| 'ended'
	| 'error'
	| 'destroyed'
	| 'timeUpdate'
	| 'firstBytes'
	| 'firstFrame'
	| 'qualityChange'
	| 'tracksChange'
	| 'rateChange'
	| 'volumeChange';

export interface AdapterEvent {
	type: AdapterEventType;
	positionMs?: number;
	durationMs?: number;
	error?: PlaybackErrorInfo;
}

export interface AdapterPrepareRequest {
	source: Source;
	surface: HTMLElement;
	startPositionMs: number;
	muted: boolean;
	capabilities: DeviceCapabilities;
}

export interface PlaybackAdapter {
	prepare(request: AdapterPrepareRequest): Promise<void>;
	play(): Promise<void> | void;
	pause(): Promise<void> | void;
	seek(positionMs: number): Promise<void> | void;
	seekLive(offsetMs: number): Promise<void> | void;
	stop(): Promise<void> | void;
	destroy(): Promise<void>;
	getTechnicalSnapshot(): AdapterSnapshot;
	setQuality(quality: QualityType): Promise<void> | void;
	setAudioTrack(trackId: string): Promise<void> | void;
	setTextTrack(trackId: string | null): Promise<void> | void;
	setPlaybackRate(rate: number): void;
	setVolume(volume: number): Promise<void> | void;
	setMuted(muted: boolean): Promise<void> | void;
	subscribe(listener: (event: AdapterEvent) => void): Unsubscribe;
}

export interface AdapterFactory {
	create(source: Source, capabilities: DeviceCapabilities): PlaybackAdapter;
}

export interface CoreOpenRequest {
	source: Source;
	surface: HTMLElement;
	capabilities: DeviceCapabilities;
	startPositionMs: number;
	autoplay: boolean;
	muted: boolean;
	operationId: string;
	playbackKind: PlaybackKind;
	metadata?: Readonly<Record<string, unknown>>;
	sessionId?: string;
}

export interface CoreCommand {
	sessionId: string;
	mediaEpoch: number;
	operationId: string;
	initiator: CommandInitiator;
}

export interface CoreEvent<T = unknown> {
	schemaVersion: 1;
	eventId: string;
	sequence: number;
	type: AdapterEventType | 'open';
	occurredAt: number;
	monotonicTime: number;
	sessionId: string;
	mediaEpoch: number;
	operationId?: string;
	correlationId?: string;
	causeEventId?: string;
	playbackKind: PlaybackKind;
	metadata?: Readonly<Record<string, unknown>>;
	initiator: CommandInitiator;
	positionMs: number;
	durationMs: number;
	payload: T;
	snapshot: PlaybackSnapshot;
}

export interface Clock {
	now(): number;
	monotonicNow(): number;
}
