import type { Game } from '../game/game';

/** Module-level handle so React components can call into the imperative game. */
export const gameRef: { current: Game | null } = { current: null };
export const G = () => gameRef.current!;
