import type { Server, Socket } from "node:net";

/** Tracks a listener's live sockets and returns the action that closes all of them. */
export function trackConnections(server: Server): () => void {
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });
  return closeConnections;

  function closeConnections(): void {
    for (const socket of sockets) {
      socket.destroy();
    }
  }
}
