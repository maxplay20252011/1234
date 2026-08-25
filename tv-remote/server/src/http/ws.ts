import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { StateHub } from '../services/state-hub.js';
import { logger } from '../logger.js';

/**
 * Canal de estado en vivo.
 *
 * Es de una sola via: los comandos van por REST y por aca solo bajan
 * novedades. Mezclar ambas cosas obligaria a inventar un protocolo de
 * peticion y respuesta sobre el socket sin ganar nada.
 */
export function registerStateSocket(app: FastifyInstance, hub: StateHub): void {
  const clientes = new Set<WebSocket>();

  hub.on('message', (mensaje) => {
    const texto = JSON.stringify(mensaje);
    for (const cliente of clientes) {
      if (cliente.readyState === cliente.OPEN) cliente.send(texto);
    }
  });

  app.get('/api/ws', { websocket: true }, (socket) => {
    clientes.add(socket);
    logger.debug({ clientes: clientes.size }, 'Interfaz conectada al canal de estado');

    // Al conectar se manda el ultimo estado conocido de cada dispositivo, para
    // que la pantalla se dibuje llena en vez de esperar al proximo sondeo.
    for (const mensaje of hub.snapshot()) socket.send(JSON.stringify(mensaje));

    socket.on('close', () => {
      clientes.delete(socket);
      logger.debug({ clientes: clientes.size }, 'Interfaz desconectada');
    });
    socket.on('error', () => clientes.delete(socket));
  });
}
