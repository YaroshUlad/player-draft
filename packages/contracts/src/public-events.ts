import type {QualityType} from './playback';
import type {AdSection, TvProgrammeItem} from './playlist-item';

export type {AdSection} from './playlist-item';
export type RecoveryFailureReason = 'recover-fail' | 'playback-is-not-available' | 'no-internet';

export interface PlaybackAudioTrack {
	name: string;
	description: string;
	value: string;
}

export interface PlaybackTextTrack {
	id: string;
	name: string;
	lang: string;
	url?: string;
	isAuto: boolean;
}

export interface PlaybackPropertiesUpdate {
	qualities?: readonly {value: QualityType; name: string; disabled?: boolean}[];
	currentQualityIndex?: number;
	currentPlaybackRateIndex?: number;
	playbackRates?: readonly {name: string; value: number}[];
	audioTracks?: readonly PlaybackAudioTrack[];
	currentAudioTrackIndex?: number | null;
	textTracks?: readonly PlaybackTextTrack[];
}

export interface ProductStatEvent {
	eventName: string;
	commonProperties?: Readonly<Record<string, unknown>>;
	payload?: Readonly<Record<string, unknown>>;
	items?: readonly Readonly<Record<string, unknown>>[];
}

export interface AdvertisementStartData {
	section: AdSection;
	parentId?: string;
	id: string;
	type?: string;
	url: string;
	mediaType?: string;
	allowClose?: boolean;
	allowCloseDelay?: number;
	point?: number;
	duration: number;
}

export interface PublicEventMap {
	'player-playing': undefined;
	'player-paused': {pausedPosition: number};
	'player-time-update': {time: number};
	'player-first-frame': undefined;
	'player-buffering-started': undefined;
	'player-buffering-ended': undefined;
	'event-video-ended': undefined;
	'player-quality-changed': {quality: string | number};
	'playback-properties-update': PlaybackPropertiesUpdate;
	'player-recovery-failed': {reason: RecoveryFailureReason};
	'player-live-status-changed': {from: string; to: string};
	'tv-channel-server-time-update': {time: number; serverTime: number};
	'tv-channel-programme-update': {current: TvProgrammeItem | null; next: TvProgrammeItem | null};
	'player-advertisement-start': {data: AdvertisementStartData};
	'player-advertisement-started-playing': undefined;
	'player-advertisement-end': {section: AdSection};
	'player-advertisement-error': {error: string};
	'player-adv-get-banners': {data: {pause: object}};
	'player-subtitle-cue': {trackId: string | null; text: string; startMs: number | null; endMs: number | null};
	'player-subtitle-error': {trackId: string; error: string};
	'prod-stat-event': ProductStatEvent;
}

export type PublicEventName = keyof PublicEventMap;
