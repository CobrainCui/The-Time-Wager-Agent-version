import { Server } from "socket.io";

let gameIo: Server | null = null;

export function setGameIo(io: Server): void {
  gameIo = io;
}

export function getGameIo(): Server | null {
  return gameIo;
}
