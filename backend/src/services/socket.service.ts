import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { config } from '../config';
import { verifyAccessToken } from '../utils/security';
import { Role } from '@prisma/client';
import { SocketEventName } from '../types/socketEvents';

// Extended socket with user payload
interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    role: Role;
    name: string;
    email?: string | null;
  };
}

let ioServer: Server | null = null;

const allowedOrigins =
  config.nodeEnv === 'production'
    ? [config.webAppUrl, ...config.extraCorsOrigins].filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        config.webAppUrl,
        ...config.extraCorsOrigins,
      ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

export function initSocketService(httpServer: HttpServer): Server {
  ioServer = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    path: '/socket.io',
  });

  const liveNamespace = ioServer.of('/live');

  // Authentication Middleware
  liveNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: Missing token'));
    }
    try {
      const payload = verifyAccessToken(token);
      const authSocket = socket as unknown as AuthenticatedSocket;
      authSocket.user = payload;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  liveNamespace.on('connection', (socket: Socket) => {
    const authSocket = socket as unknown as AuthenticatedSocket;
    const user = authSocket.user;
    
    if (!user) {
      logger.warn({ socketId: socket.id }, 'Socket connection without user authentication');
      socket.disconnect();
      return;
    }
    
    logger.info({ socketId: socket.id, userId: user.userId, role: user.role }, 'Authenticated client connected to /live namespace');

    // Restrict orders room to authorized staff
    const authorizedRolesForOrders = [Role.OWNER, Role.MANAGER, Role.CASHIER, Role.WAITER, Role.COOKER, Role.BARISTA];
    if (authorizedRolesForOrders.includes(user.role)) {
      socket.join('orders');
      logger.info({ socketId: socket.id, role: user.role }, 'Socket joined room: orders');
    }

    // Removed arbitrary 'join_room' to prevent unauthorized access

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id, userId: user.userId }, 'Client disconnected from /live namespace');
    });
  });

  return ioServer;
}

/**
 * Emit an event to all connected clients in the orders room
 * 
 * @param event - The event name from SocketEventName type
 * @param payload - The event payload
 */
export function emitToLiveOrders(event: SocketEventName, payload: Record<string, unknown>) {
  if (!ioServer) {
    logger.warn('Socket.io server not initialized; suppressing broadcast.');
    return;
  }
  const liveNamespace = ioServer.of('/live');
  liveNamespace.to('orders').emit(event, payload);
  logger.info({ event, payloadId: payload?.id }, 'Emitted event to /live orders room');
}

/**
 * Emit to a specific room
 */
export function emitToRoom(room: string, event: SocketEventName, payload: Record<string, unknown>) {
  if (!ioServer) {
    logger.warn('Socket.io server not initialized; suppressing broadcast.');
    return;
  }
  const liveNamespace = ioServer.of('/live');
  liveNamespace.to(room).emit(event, payload);
  logger.info({ event, room, payloadId: payload?.id }, 'Emitted event to room');
}
