import type {PlaybackKind, PlaybackState} from '../../../contracts/src/playback';
import type {PlaylistItemModel} from '../../../contracts/src/playlist-item';

export type StatEventName =
	| 'start_session'
	| 'playback_started'
	| 'ready'
	| 'play'
	| 'playing'
	| 'first_video_frame_decoded'
	| 'first_byte_media'
	| 'pause'
	| 'resume'
	| 'buffer_starvation'
	| 'stop'
	| 'quality_changed'
	| 'cannot_play'
	| 'watch_coverage'
	| 'watch_coverage_live'
	| 'seeking'
	| 'seeked'
	| 'subtitles_switched'
	| 'audio_track_switched'
	| 'watched_n'
	| 'sound_changed'
	| 'content_end_reached'
	| 'telemetry'
	| 'adv_request'
	| 'adv_break_started'
	| 'adv_break_ended'
	| 'adv_error';

export interface StatEvent {
	eventId: string;
	eventName: StatEventName;
	eventNumber: number;
	vsid: string;
	sessionId: string;
	mediaEpoch: number;
	occurredAt: number;
	positionMs: number;
	durationMs: number;
	tvtMs: number;
	playbackKind: PlaybackKind;
	state: PlaybackState;
	engine: string;
	format: string;
	quality: string | null;
	cdnHost?: string;
	item: PlaylistItemModel;
	payload: Readonly<Record<string, unknown>>;
}

export interface StatsProvider {
	readonly destination: string;
	serialize(event: StatEvent): Record<string, unknown> | null;
}

export type OutboxStatus = 'pending' | 'inFlight';

export interface OutboxRecord {
	recordId: string;
	destination: string;
	eventId: string;
	status: OutboxStatus;
	payload: Record<string, unknown>;
}

export interface StatsTransport {
	send(records: readonly OutboxRecord[]): Promise<void>;
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}
