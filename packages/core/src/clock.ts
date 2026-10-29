import type {Clock} from '../../contracts/src/playback';

export const systemClock: Clock = {
	now: () => Date.now(),
	monotonicNow: () => globalThis.performance?.now() ?? Date.now()
};
