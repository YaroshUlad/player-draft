import type {StatEvent, StatsProvider} from './types';

export class Uv2025StatsProvider implements StatsProvider {
	readonly destination = 'uv-2025';

	serialize(event: StatEvent): Record<string, unknown> {
		return {
			vsid: event.vsid,
			uv_movie_id: event.item.ovId ?? event.item.rawId,
			event_name: event.eventName,
			client_time: event.occurredAt,
			event_number: event.eventNumber,
			playback_position: event.positionMs,
			cdn_host: event.cdnHost ?? '',
			current_tvt: Math.ceil(event.tvtMs / 1000),
			...event.payload
		};
	}
}
