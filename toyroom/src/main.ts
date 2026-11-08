import { Game } from './game/Game';

const game = new Game(document.getElementById('app') as HTMLElement);
game.boot();
