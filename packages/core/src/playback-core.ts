import type {
	AdapterEvent,
	AdapterFactory,
	Clock,
	CommandInitiator,
	CoreCommand,
	CoreEvent,
	CoreOpenRequest,
	PlaybackSnapshot,
	QualityType,
	Unsubscribe
} from '../../contracts/src/playback';
import type {PlaybackState} from '../../contracts/src/playback';
import {systemClock} from './clock';
import {PlayerError, toPlayerError} from './errors';
import {PlaybackSession} from './playback-session';

export class PlaybackCore {
	private session: PlaybackSession | null = null;
	private mediaEpoch = 0;
	private sessionCounter = 0;
	private eventCounter = 0;
	private readonly listeners = new Set<(event: CoreEvent) => void>();
	private readonly seekResumeStates = new WeakMap<PlaybackSession, PlaybackState>();

	constructor(
		private readonly adapterFactory: AdapterFactory,
		private readonly clock: Clock = systemClock
	) {}

	async open(request: CoreOpenRequest): Promise<PlaybackSnapshot> {
		await this.destroy();

		const sessionId = request.sessionId ?? `playback-${++this.sessionCounter}`;
		const session = new PlaybackSession(sessionId, ++this.mediaEpoch, request, this.adapterFactory);
		this.session = session;
		session.unsubscribe = session.adapter.subscribe((event) => this.handleAdapterEvent(session, event));
		this.emit(session, 'loading', {source: request.source});

		try {
			await session.adapter.prepare({
				source: request.source,
				surface: request.surface,
				startPositionMs: request.startPositionMs,
				muted: request.muted,
				capabilities: request.capabilities
			});
			this.assertActive(session);

			if (session.state !== 'ready') {
				session.state = 'ready';
				this.emit(session, 'ready', {});
			}

			if (request.autoplay) {
				await this.play(this.createCommand(`${request.operationId}:autoplay`, 'sdk'));
			}

			return session.getSnapshot();
		} catch (error) {
			const playerError = toPlayerError(error, 'OPEN_FAILED');
			if (this.session === session && session.state !== 'error') {
				session.state = 'error';
				this.emit(session, 'error', {error: playerError});
			}
			throw playerError;
		}
	}

	async play(command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		this.emit(session, 'willPlay', {});
		await session.adapter.play();
	}

	async pause(command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		this.emit(session, 'willPause', {});
		await session.adapter.pause();
	}

	async seek(positionMs: number, command: CoreCommand): Promise<void> {
		if (!Number.isFinite(positionMs) || positionMs < 0) {
			throw new PlayerError('INVALID_POSITION', `Invalid seek position: ${positionMs}`);
		}

		const session = this.getSession(command);
		this.prepareCommand(session, command);
		this.emit(session, 'willSeek', {positionMs});
		await session.adapter.seek(positionMs);
	}

	async seekLive(offsetMs: number, command: CoreCommand): Promise<void> {
		if (!Number.isFinite(offsetMs) || offsetMs < 0) {
			throw new PlayerError('INVALID_LIVE_OFFSET', `Invalid live offset: ${offsetMs}`);
		}

		const session = this.getSession(command);
		if (!session.adapter.getTechnicalSnapshot().capabilities.seekLive) {
			throw new PlayerError('SEEK_LIVE_UNSUPPORTED', 'Live seek is not supported by the active adapter');
		}
		this.prepareCommand(session, command);
		this.emit(session, 'willSeek', {offsetMs});
		await session.adapter.seekLive(offsetMs);
	}

	async stop(command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		this.emit(session, 'willStop', {});
		await session.adapter.stop();
	}

	async setQuality(quality: QualityType, command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		await session.adapter.setQuality(quality);
	}

	async setAudioTrack(trackId: string, command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		await session.adapter.setAudioTrack(trackId);
	}

	async setTextTrack(trackId: string | null, command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		await session.adapter.setTextTrack(trackId);
	}

	async setPlaybackRate(rate: number, command: CoreCommand): Promise<void> {
		if (!Number.isFinite(rate) || rate <= 0) {
			throw new PlayerError('INVALID_PLAYBACK_RATE', `Invalid playback rate: ${rate}`);
		}

		const session = this.getSession(command);
		this.prepareCommand(session, command);
		session.adapter.setPlaybackRate(rate);
	}

	async setVolume(volume: number, command: CoreCommand): Promise<void> {
		if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
			throw new PlayerError('INVALID_VOLUME', `Invalid volume: ${volume}`);
		}

		const session = this.getSession(command);
		this.prepareCommand(session, command);
		await session.adapter.setVolume(volume);
	}

	async setMuted(muted: boolean, command: CoreCommand): Promise<void> {
		const session = this.getSession(command);
		this.prepareCommand(session, command);
		await session.adapter.setMuted(muted);
	}

	createCommand(operationId: string, initiator: CommandInitiator = 'host'): CoreCommand {
		const session = this.session;
		if (!session) {
			throw new PlayerError('NO_ACTIVE_SESSION', 'No active playback session');
		}

		return {
			sessionId: session.id,
			mediaEpoch: session.mediaEpoch,
			operationId,
			initiator
		};
	}

	getSnapshot(): PlaybackSnapshot {
		if (this.session) {
			return this.session.getSnapshot();
		}

		return {
			sessionId: null,
			mediaEpoch: this.mediaEpoch,
			state: 'idle',
			positionMs: 0,
			durationMs: 0,
			live: {isLive: false, offsetMs: null, seekableRanges: []},
			source: null,
			engine: null,
			quality: {requested: 'Auto', current: null, isAuto: true, bitrate: null, available: []},
			audioTracks: [],
			textTracks: [],
			playbackRate: 1,
			volume: 1,
			muted: false,
			capabilities: {
				seek: true,
				seekLive: false,
				quality: false,
				audioTracks: false,
				textTracks: false,
				playbackRate: false,
				volume: false
			}
		};
	}

	subscribe(listener: (event: CoreEvent) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async destroy(): Promise<void> {
		const session = this.session;
		if (!session) {
			return;
		}

		this.session = null;
		session.unsubscribe?.();
		session.unsubscribe = null;
		await session.adapter.destroy();
		session.state = 'destroyed';
		this.emit(session, 'destroyed', {});
	}

	private getSession(command: CoreCommand): PlaybackSession {
		const session = this.session;
		if (!session || session.id !== command.sessionId || session.mediaEpoch !== command.mediaEpoch) {
			throw new PlayerError('STALE_OPERATION', `Operation ${command.operationId} belongs to an inactive session`);
		}
		return session;
	}

	private assertActive(session: PlaybackSession): void {
		if (this.session !== session) {
			throw new PlayerError('STALE_OPERATION', `Session ${session.id} is no longer active`);
		}
	}

	private prepareCommand(session: PlaybackSession, command: CoreCommand): void {
		session.operationId = command.operationId;
		session.initiator = command.initiator;
	}

	private handleAdapterEvent(session: PlaybackSession, event: AdapterEvent): void {
		if (this.session !== session) {
			return;
		}

		switch (event.type) {
			case 'idle':
			case 'loading':
			case 'ready':
			case 'playing':
			case 'paused':
			case 'waiting':
			case 'ended':
			case 'error':
			case 'destroyed':
				session.state = event.type;
				break;
			case 'seeking':
				if (session.state !== 'seeking') {
					this.seekResumeStates.set(session, session.state);
				}
				session.state = 'seeking';
				break;
			case 'seeked':
				session.state = this.seekResumeStates.get(session) ?? 'paused';
				this.seekResumeStates.delete(session);
				break;
			case 'willPlay':
			case 'willPause':
			case 'willSeek':
			case 'willStop':
			case 'timeUpdate':
			case 'firstBytes':
			case 'firstFrame':
			case 'qualityChange':
			case 'tracksChange':
			case 'rateChange':
			case 'volumeChange':
				break;
		}

		this.emit(session, event.type, event);
	}

	private emit(session: PlaybackSession, type: CoreEvent['type'], payload: unknown): void {
		const snapshot = session.getSnapshot();
		const sequence = ++this.eventCounter;
		const event: CoreEvent = {
			schemaVersion: 1,
			eventId: `${session.id}:${sequence}`,
			sequence,
			type,
			occurredAt: this.clock.now(),
			monotonicTime: this.clock.monotonicNow(),
			sessionId: session.id,
			mediaEpoch: session.mediaEpoch,
			operationId: session.operationId,
			playbackKind: session.request.playbackKind,
			...(session.request.metadata ? {metadata: session.request.metadata} : {}),
			initiator: session.initiator,
			positionMs: snapshot.positionMs,
			durationMs: snapshot.durationMs,
			payload,
			snapshot
		};

		for (const listener of this.listeners) {
			listener(event);
		}
	}
}
