import type {StatEventName, StatEvent, StatsProvider} from './types';

const OPERATION_BY_EVENT: Partial<Record<StatEventName, string>> = {
	play: 'action_play',
	first_byte_media: 'first_bytes',
	ready: 'player_ready',
	first_video_frame_decoded: 'first_frame',
	pause: 'action_pause',
	playing: 'playing',
	seeking: 'seek',
	seeked: 'seek',
	watch_coverage: 'watch_coverage_record',
	watch_coverage_live: 'watch_coverage_live',
	buffer_starvation: 'empty_buffer',
	stop: 'action_stop',
	cannot_play: 'content_error',
	quality_changed: 'quality'
};

export class OneStatProvider implements StatsProvider {
	readonly destination = 'one-stat';

	serialize(event: StatEvent): Record<string, unknown> | null {
		const operation = OPERATION_BY_EVENT[event.eventName];
		if (!operation) {
			return null;
		}
		return {
			event_name: operation,
			video_id: event.item.rawId,
			vsid: event.vsid,
			client_time: event.occurredAt,
			playback_position: event.positionMs,
			...event.payload
		};
	}
}
