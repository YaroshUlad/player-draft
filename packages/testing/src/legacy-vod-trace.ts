import type {StatEventName} from '../../extensions/stats/src/types';
import type {StatsTraceEvent} from './stats-trace-comparator';

const BASE_TIME = 1_700_000_000_000;

interface TraceDefinition {
	name: StatEventName;
	positionMs: number;
	tvtMs?: number;
	timeOffsetMs?: number;
	payload?: Record<string, unknown>;
}

const TRACE: readonly TraceDefinition[] = [
	{name: 'start_session', positionMs: 0, payload: {stats_version: '2.0.0', stream_profile: 'vod'}},
	{name: 'play', positionMs: 0},
	{name: 'ready', positionMs: 1_000, payload: {buffer_time: 0}},
	{name: 'playback_started', positionMs: 1_000, payload: {
		stats_version: '2.0.0',
		stream_profile: 'vod',
		playback_rate: 1,
		muted: false,
		sound_volume: 100,
		user_quality: 'auto'
	}},
	{name: 'telemetry', positionMs: 1_000, payload: {content_type: 'hls', user_quality: 'auto'}},
	{name: 'first_byte_media', positionMs: 1_000},
	{name: 'first_video_frame_decoded', positionMs: 1_000},
	{name: 'watched_n', positionMs: 4_000, tvtMs: 3_000, timeOffsetMs: 3_000, payload: {seconds: 3}},
	{name: 'seeking', positionMs: 4_000, tvtMs: 3_000, timeOffsetMs: 3_000, payload: {
		requestedPositionMs: 30_000,
		seek_type: 'slider'
	}},
	{name: 'buffer_starvation', positionMs: 4_000, tvtMs: 3_000, timeOffsetMs: 3_000},
	{name: 'watch_coverage', positionMs: 4_000, tvtMs: 3_000, timeOffsetMs: 3_000, payload: {start: 1_000, end: 4_000}},
	{name: 'seeked', positionMs: 30_000, tvtMs: 3_000, timeOffsetMs: 3_000},
	{name: 'telemetry', positionMs: 30_000, tvtMs: 3_000, timeOffsetMs: 3_000, payload: {
		content_type: 'hls',
		user_quality: 'auto'
	}},
	{name: 'pause', positionMs: 30_000, tvtMs: 3_000, timeOffsetMs: 3_000},
	{name: 'stop', positionMs: 30_000, tvtMs: 3_000, timeOffsetMs: 3_000}
];

export function createLegacyVodTrace(vsid: string): StatsTraceEvent[] {
	return TRACE.map((definition, index) => ({
		destination: 'uv-2025',
		eventName: definition.name,
		eventNumber: index,
		payload: {
			vsid,
			uv_movie_id: '-1_1',
			event_name: definition.name,
			client_time: BASE_TIME + (definition.timeOffsetMs ?? 0),
			event_number: index,
			playback_position: definition.positionMs,
			cdn_host: 'media.test',
			current_tvt: Math.ceil((definition.tvtMs ?? 0) / 1000),
			...definition.payload
		}
	}));
}
