import type {MediaFiles} from './playback';

export type PlaylistItemType =
	| 'live'
	| 'video'
	| 'music_video'
	| 'ugc_music_video'
	| 'short_video'
	| 'interactive'
	| 'tv_channel';

export type LiveStatus = 'upcoming' | 'waiting' | 'started' | 'finished' | 'postlive';
export type AdSection = 'preroll' | 'midroll' | 'postroll';

export interface AdCreative {
	id: string;
	url: string;
	mediaType: 'mp4' | 'hls';
	durationMs: number;
	startMs?: number;
	allowSkip?: boolean;
	skipAfterMs?: number;
	advertiserInfo?: string;
}

export interface AdvertisementConfig {
	preroll?: readonly AdCreative[];
	midroll?: readonly AdCreative[];
	postroll?: readonly AdCreative[];
}

export interface TvProgrammeItem {
	id: string;
	title: string;
	startAtMs: number;
	stopAtMs: number;
}

export interface Scte35Action {
	timestampMs: number;
	uniqueProgramId: number;
}

export interface SubtitleTrackData {
	id: string;
	name: string;
	language: string;
	url: string;
	isDefault?: boolean;
}

export interface PlaylistItemModel {
	id?: string;
	ovId?: number;
	rawId: string;
	ownerId?: number;
	type: PlaylistItemType;
	title?: string;
	duration?: number;
	isLive?: boolean;
	liveStatus?: LiveStatus;
	liveCanRewind?: boolean;
	liveRewindDuration?: number;
	liveIsEndless?: boolean;
	trackCode?: string;
	showProgram?: boolean;
	isVitrina?: boolean;
	programme?: readonly TvProgrammeItem[];
	scte35Actions?: readonly Scte35Action[];
	ads?: AdvertisementConfig;
	subtitles?: readonly SubtitleTrackData[];
	files: MediaFiles;
}

export interface PlaylistItemPlayback {
	loop?: boolean;
	startPosition?: number;
}

export interface PlaylistItem {
	model: PlaylistItemModel;
	playback: PlaylistItemPlayback;
}
