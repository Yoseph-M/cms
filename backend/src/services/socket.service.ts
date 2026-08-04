import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';

let ioServer: Server | null = null;

export function initSocketService(httpServer: HttpServer): Server {
  ioServer = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    },
    path: '/socket.io',
  });

  const liveNamespace = ioServer.of('/live');

  liveNamespace.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected to /live namespace');

    // Auto-join orders room
    socket.join('orders');
    logger.info({ socketId: socket.id }, 'Socket joined room: orders');

    socket.on('join_room', (roomName: string) => {
      socket.join(roomName);
      logger.info({ socketId: socket.id, roomName }, 'Socket joined custom room');
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected from /live namespace');
    });
  });

  return ioServer;
}

export function emitToLiveOrders(event: string, payload: any) {
  if (!ioServer) {
    logger.warn('Socket.io server not initialized; suppressing broadcast.');
    return;
  }
  const liveNamespace = ioServer.of('/live');
  liveNamespace.to('orders').emit(event, payload);
  logger.info({ event, payloadId: payload?.id }, 'Emitted event to /live orders room');
}
