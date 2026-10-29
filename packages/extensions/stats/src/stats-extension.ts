import type {PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent} from '../../../contracts/src/playback';
import type {PlaylistItem, PlaylistItemModel} from '../../../contracts/src/playlist-item';
import type {StatsOutbox} from './stats-outbox';
import type {StatEvent, StatEventName, StatsProvider} from './types';

interface StatsSession {
	readonly item: PlaylistItemModel;
	readonly vsid: string;
	readonly providerSequences: Record<string, number>;
	readonly milestones: Set<string>;
	closed: boolean;
	hasPlayed: boolean;
	playEmitted: boolean;
	wasPaused: boolean;
	readyEmitted: boolean;
	pauseEmitted: boolean;
	seekingEmitted: boolean;
	needsPlayingEvent: boolean;
	loadingAt: number;
	firstBytesEmitted: boolean;
	firstFrameEmitted: boolean;
	coverageAnchorMs: number | null;
	lastPositionMs: number;
	lastTimeUpdateAt: number | null;
	tvtMs: number;
	emissionCounter: number;
	lastEvent: CoreEvent;
	previousAudioKey: string | null;
	previousTextKey: string | null;
}

interface AdStatsSession {
	readonly item: PlaylistItemModel;
	readonly vsid: string;
	readonly section: string;
	readonly creativeId: string;
	readonly durationMs: number;
	readonly providerSequences: Record<string, number>;
	emissionCounter: number;
	closed: boolean;
	lastEvent: CoreEvent;
}

export interface StatsExtensionOptions {
	providers: readonly StatsProvider[];
	outbox: StatsOutbox;
	autoFlush?: boolean;
	coverageHeartbeatMs?: number;
	createVsid?: () => string;
}

let fallbackVsidCounter = 0;

function createVsid(): string {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	fallbackVsidCounter++;
	return `vsid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${fallbackVsidCounter}`;
}

export class StatsExtension implements PlayerExtension {
	readonly name = 'stats';
	private readonly sessions = new Map<string, StatsSession>();
	private readonly adSessions = new Map<string, AdStatsSession>();
	private lastContentSession: StatsSession | null = null;
	private pendingItem: PlaylistItem | null = null;
	private readonly autoFlush: boolean;
	private readonly coverageHeartbeatMs: number;
	private readonly createVsid: () => string;

	constructor(private readonly options: StatsExtensionOptions) {
		this.autoFlush = options.autoFlush ?? true;
		this.coverageHeartbeatMs = options.coverageHeartbeatMs ?? 10_000;
		this.createVsid = options.createVsid ?? createVsid;
	}

	beforeOpen(item: PlaylistItem): void {
		this.pendingItem = item;
	}

	onEvent(event: CoreEvent): void {
		if (event.playbackKind === 'advertisement') {
			this.onAdEvent(event);
			return;
		}
		let session = this.sessions.get(event.sessionId);
		if (!session && event.type === 'loading') {
			session = this.createSession(event);
			this.sessions.set(event.sessionId, session);
			this.emit(session, 'start_session', {
				stats_version: '2.0.0',
				stream_profile: event.snapshot.live.isLive ? 'live' : 'vod'
			});
			this.emit(session, 'play', {});
			session.playEmitted = true;
		}
		if (!session) {
			return;
		}
		session.lastEvent = event;

		switch (event.type) {
			case 'loading':
				break;
			case 'willPlay':
				if (!session.playEmitted) {
					this.emit(session, 'play', {});
				}
				session.playEmitted = false;
				break;
			case 'willPause':
				this.closeCoverage(session);
				this.emit(session, 'pause', {});
				session.pauseEmitted = true;
				session.wasPaused = true;
				session.lastPositionMs = event.positionMs;
				session.lastTimeUpdateAt = null;
				break;
			case 'willSeek':
				this.emitSeeking(session);
				break;
			case 'willStop':
				this.closeCoverage(session);
				break;
			case 'ready':
				session.lastPositionMs = event.positionMs;
				if (!session.readyEmitted) {
					session.readyEmitted = true;
					this.emit(session, 'ready', {buffer_time: Math.max(0, event.occurredAt - session.loadingAt)});
				}
				break;
			case 'firstBytes':
				if (!session.firstBytesEmitted) {
					session.firstBytesEmitted = true;
					this.emit(session, 'first_byte_media', {});
				}
				break;
			case 'firstFrame':
				if (!session.firstFrameEmitted) {
					session.firstFrameEmitted = true;
					this.emit(session, 'first_video_frame_decoded', {});
				}
				break;
			case 'playing':
				session.coverageAnchorMs ??= event.positionMs;
				session.lastPositionMs = event.positionMs;
				session.lastTimeUpdateAt = event.occurredAt;
				if (!session.hasPlayed) {
					session.hasPlayed = true;
					this.emit(session, 'playback_started', this.getPlaybackStartedPayload(session));
					this.emitTelemetry(session);
				} else {
					if (session.wasPaused) {
						this.emit(session, 'resume', {});
					}
					if (session.needsPlayingEvent) {
						this.emit(session, 'playing', {});
					}
				}
				session.wasPaused = false;
				session.pauseEmitted = false;
				session.needsPlayingEvent = false;
				break;
			case 'paused':
				if (!session.pauseEmitted) {
					this.closeCoverage(session);
					this.emit(session, 'pause', {});
				}
				session.pauseEmitted = false;
				session.wasPaused = true;
				session.lastPositionMs = event.positionMs;
				session.lastTimeUpdateAt = null;
				break;
			case 'waiting':
				this.closeCoverage(session);
				this.emit(session, 'buffer_starvation', {});
				session.needsPlayingEvent = true;
				session.lastTimeUpdateAt = null;
				break;
			case 'seeking':
				if (!session.seekingEmitted) {
					this.emitSeeking(session);
				}
				session.seekingEmitted = false;
				break;
			case 'seeked':
				session.lastPositionMs = event.positionMs;
				session.coverageAnchorMs = event.positionMs;
				session.needsPlayingEvent = true;
				this.emit(session, 'seeked', {});
				this.emitTelemetry(session);
				break;
			case 'timeUpdate':
				this.onTimeUpdate(session);
				break;
			case 'qualityChange':
				this.emit(session, 'quality_changed', {
					requested: event.snapshot.quality.requested,
					current: event.snapshot.quality.current
				});
				break;
			case 'tracksChange':
				this.onTracksChange(session);
				break;
			case 'volumeChange':
				this.emit(session, 'sound_changed', {
					volume: event.snapshot.volume,
					muted: event.snapshot.muted
				});
				break;
			case 'ended':
				session.lastPositionMs = event.positionMs;
				this.closeCoverage(session);
				this.emit(session, 'content_end_reached', {});
				session.lastTimeUpdateAt = null;
				break;
			case 'error':
				this.closeCoverage(session);
				this.emit(session, 'cannot_play', {error: this.getErrorPayload(event)});
				session.lastTimeUpdateAt = null;
				break;
			case 'idle':
			case 'destroyed':
				this.closeSession(session);
				break;
			default:
				break;
		}
	}

	async shutdown(): Promise<void> {
		for (const session of this.sessions.values()) {
			this.closeSession(session);
		}
		for (const session of this.adSessions.values()) {
			this.closeAdSession(session);
		}
		this.sessions.clear();
		this.adSessions.clear();
		this.lastContentSession = null;
		this.pendingItem = null;
		await this.options.outbox.flush();
	}

	async dispose(): Promise<void> {
		this.sessions.clear();
		this.adSessions.clear();
		await this.options.outbox.idle();
	}

	private onAdEvent(event: CoreEvent): void {
		let session = this.adSessions.get(event.sessionId);
		if (!session && event.type === 'loading') {
			const metadata = event.metadata;
			const section = typeof metadata?.section === 'string' ? metadata.section : null;
			const creativeId = typeof metadata?.creativeId === 'string' ? metadata.creativeId : null;
			if (!section || !creativeId) {
				return;
			}
			const content = this.lastContentSession && this.pendingItem?.model.rawId === this.lastContentSession.item.rawId
				? this.lastContentSession
				: null;
			const item = content?.item ?? this.pendingItem?.model ?? {
				rawId: 'unknown',
				type: 'video' as const,
				files: {}
			};
			session = {
				item,
				vsid: content?.vsid ?? this.createVsid(),
				section,
				creativeId,
				durationMs: typeof metadata?.durationMs === 'number' ? metadata.durationMs : event.durationMs,
				providerSequences: {},
				emissionCounter: 0,
				closed: false,
				lastEvent: event
			};
			this.adSessions.set(event.sessionId, session);
			this.emitAd(session, 'adv_request', {});
			this.emitAd(session, 'adv_break_started', {});
		}
		if (!session) {
			return;
		}
		session.lastEvent = event;
		switch (event.type) {
			case 'ended':
				this.closeAdSession(session);
				break;
			case 'error':
				this.emitAd(session, 'adv_error', {error: this.getErrorPayload(event)});
				this.closeAdSession(session);
				break;
			case 'idle':
			case 'destroyed':
				this.closeAdSession(session);
				break;
			default:
				break;
		}
	}

	private closeAdSession(session: AdStatsSession): void {
		if (session.closed) {
			return;
		}
		this.emitAd(session, 'adv_break_ended', {});
		session.closed = true;
	}

	private emitAd(session: AdStatsSession, eventName: StatEventName, payload: Record<string, unknown>): void {
		const event = session.lastEvent;
		const cdnHost = event.snapshot.source ? this.getHost(event.snapshot.source.url) : undefined;
		const base = {
			eventId: `${event.sessionId}:${++session.emissionCounter}:${eventName}`,
			eventName,
			vsid: session.vsid,
			sessionId: event.sessionId,
			mediaEpoch: event.mediaEpoch,
			occurredAt: event.occurredAt,
			positionMs: event.positionMs,
			durationMs: session.durationMs,
			tvtMs: this.lastContentSession?.tvtMs ?? 0,
			playbackKind: event.playbackKind,
			state: event.snapshot.state,
			engine: event.snapshot.engine?.type ?? 'unknown',
			format: event.snapshot.source?.format ?? 'unknown',
			quality: event.snapshot.quality.current,
			...(cdnHost ? {cdnHost} : {}),
			item: session.item,
			payload: {
				...payload,
				adv_position: session.section,
				adv_creative_id: session.creativeId,
				adv_duration: session.durationMs,
				adv_url: event.snapshot.source?.url
			}
		};
		for (const provider of this.options.providers) {
			if (provider.destination === 'one-stat' && event.snapshot.engine?.type === 'vkplayer') {
				continue;
			}
			const eventNumber = session.providerSequences[provider.destination] ?? 0;
			const statEvent: StatEvent = {...base, eventNumber};
			const serialized = provider.serialize(statEvent);
			if (!serialized) {
				continue;
			}
			session.providerSequences[provider.destination] = eventNumber + 1;
			this.options.outbox.enqueue(provider.destination, statEvent, serialized);
			if (this.autoFlush) {
				void this.options.outbox.flush(provider.destination);
			}
		}
	}

	private createSession(event: CoreEvent): StatsSession {
		const sourceItem = this.pendingItem?.model ?? {
			rawId: 'unknown',
			type: 'video' as const,
			files: {}
		};
		const item = {...sourceItem, files: {...sourceItem.files}};
		const session: StatsSession = {
			item,
			vsid: this.createVsid(),
			providerSequences: {},
			milestones: new Set<string>(),
			closed: false,
			hasPlayed: false,
			playEmitted: false,
			wasPaused: false,
			readyEmitted: false,
			pauseEmitted: false,
			seekingEmitted: false,
			needsPlayingEvent: false,
			loadingAt: event.occurredAt,
			firstBytesEmitted: false,
			firstFrameEmitted: false,
			coverageAnchorMs: null,
			lastPositionMs: event.positionMs,
			lastTimeUpdateAt: null,
			tvtMs: 0,
			emissionCounter: 0,
			lastEvent: event,
			previousAudioKey: null,
			previousTextKey: null
		};
		this.lastContentSession = session;
		return session;
	}

	private onTimeUpdate(session: StatsSession): void {
		const event = session.lastEvent;
		if (session.hasPlayed && session.lastTimeUpdateAt !== null) {
			const elapsed = event.occurredAt - session.lastTimeUpdateAt;
			if (elapsed > 0 && elapsed <= 2_000) {
				session.tvtMs += elapsed;
			}
		}
		session.lastTimeUpdateAt = event.occurredAt;
		session.lastPositionMs = event.positionMs;
		session.coverageAnchorMs ??= event.positionMs;
		if (
			this.coverageHeartbeatMs > 0 &&
			event.positionMs - session.coverageAnchorMs >= this.coverageHeartbeatMs
		) {
			this.closeCoverage(session);
		}
		this.checkMilestones(session);
	}

	private checkMilestones(session: StatsSession): void {
		for (const seconds of [3, 10]) {
			const key = `seconds:${seconds}`;
			if (session.tvtMs >= seconds * 1000 && !session.milestones.has(key)) {
				session.milestones.add(key);
				this.emit(session, 'watched_n', {seconds});
			}
		}
		const duration = session.lastEvent.durationMs;
		if (duration <= 0) {
			return;
		}
		const percent = session.lastPositionMs / duration * 100;
		for (const milestone of [25, 50, 75, 95, 100]) {
			const key = `percent:${milestone}`;
			if (percent >= milestone && !session.milestones.has(key)) {
				session.milestones.add(key);
				this.emit(session, 'watched_n', {percent: milestone});
			}
		}
	}

	private onTracksChange(session: StatsSession): void {
		const event = session.lastEvent;
		const audioKey = JSON.stringify(event.snapshot.audioTracks);
		const textKey = JSON.stringify(event.snapshot.textTracks);
		if (session.previousAudioKey === null && session.previousTextKey === null) {
			session.previousAudioKey = audioKey;
			session.previousTextKey = textKey;
			return;
		}
		if (session.previousAudioKey !== audioKey) {
			this.emit(session, 'audio_track_switched', {});
		}
		if (session.previousTextKey !== textKey) {
			this.emit(session, 'subtitles_switched', {});
		}
		session.previousAudioKey = audioKey;
		session.previousTextKey = textKey;
	}

	private emitSeeking(session: StatsSession): void {
		const event = session.lastEvent;
		const payload = event.payload as {positionMs?: number; offsetMs?: number};
		const requestedPositionMs = payload.positionMs ?? payload.offsetMs ?? event.positionMs;
		this.emit(session, 'seeking', {requestedPositionMs, seek_type: 'slider'});
		this.emit(session, 'buffer_starvation', {});
		this.closeCoverage(session);
		session.seekingEmitted = true;
		session.needsPlayingEvent = true;
		session.lastTimeUpdateAt = null;
	}

	private emitTelemetry(session: StatsSession): void {
		const event = session.lastEvent;
		this.emit(session, 'telemetry', {
			content_type: event.snapshot.source?.format ?? 'unknown',
			user_quality: event.snapshot.quality.requested.toLowerCase()
		});
	}

	private getPlaybackStartedPayload(session: StatsSession): Record<string, unknown> {
		const snapshot = session.lastEvent.snapshot;
		return {
			stats_version: '2.0.0',
			stream_profile: snapshot.live.isLive ? 'live' : 'vod',
			playback_rate: snapshot.playbackRate,
			muted: snapshot.muted,
			sound_volume: Math.round(snapshot.volume * 100),
			user_quality: snapshot.quality.requested.toLowerCase()
		};
	}

	private closeCoverage(session: StatsSession): void {
		const anchor = session.coverageAnchorMs;
		if (anchor === null) {
			return;
		}
		const end = session.lastPositionMs;
		const intervalExceeded = this.coverageHeartbeatMs > 0 && end - anchor > this.coverageHeartbeatMs * 2;
		if (end > anchor && !intervalExceeded) {
			this.emit(session, session.lastEvent.snapshot.live.isLive ? 'watch_coverage_live' : 'watch_coverage', {
				start: anchor,
				end
			});
		}
		session.coverageAnchorMs = end;
	}

	private closeSession(session: StatsSession): void {
		if (session.closed) {
			return;
		}
		this.closeCoverage(session);
		this.emit(session, 'stop', {});
		session.closed = true;
		session.lastTimeUpdateAt = null;
	}

	private emit(session: StatsSession, eventName: StatEventName, payload: Record<string, unknown>): void {
		const event = session.lastEvent;
		const cdnHost = event.snapshot.source ? this.getHost(event.snapshot.source.url) : undefined;
		const base = {
			eventId: `${session.lastEvent.sessionId}:${++session.emissionCounter}:${eventName}`,
			eventName,
			vsid: session.vsid,
			sessionId: event.sessionId,
			mediaEpoch: event.mediaEpoch,
			occurredAt: event.occurredAt,
			positionMs: session.lastPositionMs,
			durationMs: event.durationMs,
			tvtMs: session.tvtMs,
			playbackKind: event.playbackKind,
			state: event.snapshot.state,
			engine: event.snapshot.engine?.type ?? 'unknown',
			format: event.snapshot.source?.format ?? 'unknown',
			quality: event.snapshot.quality.current,
			...(cdnHost ? {cdnHost} : {}),
			item: session.item,
			payload
		};
		for (const provider of this.options.providers) {
			if (provider.destination === 'one-stat' && event.snapshot.engine?.type === 'vkplayer') {
				continue;
			}
			const eventNumber = session.providerSequences[provider.destination] ?? 0;
			const statEvent: StatEvent = {...base, eventNumber};
			const serialized = provider.serialize(statEvent);
			if (!serialized) {
				continue;
			}
			session.providerSequences[provider.destination] = eventNumber + 1;
			this.options.outbox.enqueue(provider.destination, statEvent, serialized);
			if (this.autoFlush) {
				void this.options.outbox.flush(provider.destination);
			}
		}
	}

	private getHost(url: string): string | undefined {
		return /^https?:\/\/([^/]+)/.exec(url)?.[1];
	}

	private getErrorPayload(event: CoreEvent): Record<string, unknown> {
		const payload = event.payload as {error?: unknown};
		if (payload.error instanceof Error) {
			return {message: payload.error.message, name: payload.error.name};
		}
		if (typeof payload.error === 'object' && payload.error !== null) {
			const error = payload.error as {message?: unknown; code?: unknown};
			return {message: String(error.message ?? 'Playback error'), code: String(error.code ?? 'PLAYBACK_ERROR')};
		}
		return {message: 'Playback error'};
	}
}
