import type {Clock} from '../../contracts/src/playback';

export class FakeClock implements Clock {
	private wallTime = 1_700_000_000_000;
	private monotonicTime = 0;

	now(): number {
		return this.wallTime;
	}

	monotonicNow(): number {
		return this.monotonicTime;
	}

	advance(milliseconds: number): void {
		this.wallTime += milliseconds;
		this.monotonicTime += milliseconds;
	}
}
