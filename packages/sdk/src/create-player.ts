import type {PlayerDependencies} from './player-lib';
import {PlayerLib} from './player-lib';

export function createPlayer(dependencies: PlayerDependencies = {}): PlayerLib {
	return new PlayerLib(dependencies);
}
