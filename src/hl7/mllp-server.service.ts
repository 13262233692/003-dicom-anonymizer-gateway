import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as net from 'net';
import { Subject, Observable } from 'rxjs';
import configuration from '@common/config/configuration';
import { Hl7ParserService } from './hl7-parser.service';
import { Hl7Message, Hl7EventType, Hl7Event } from '@common/types/hl7.types';

const MLLP_START_BYTE = 0x0b;
const MLLP_END_BYTE_1 = 0x1c;
const MLLP_END_BYTE_2 = 0x0d;

@Injectable()
export class MllpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MllpServerService.name);
  private server: net.Server | null = null;
  private readonly connections: Map<string, net.Socket> = new Map();
  private readonly messageSubject = new Subject<Hl7Message>();
  private readonly eventSubject = new Subject<Hl7Event>();

  constructor(
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
    private readonly hl7Parser: Hl7ParserService,
  ) {}

  onModuleInit(): void {
    this.startServer();
  }

  onModuleDestroy(): void {
    this.stopServer();
  }

  get messages$(): Observable<Hl7Message> {
    return this.messageSubject.asObservable();
  }

  get events$(): Observable<Hl7Event> {
    return this.eventSubject.asObservable();
  }

  private startServer(): void {
    const port = this.config.hl7.port;
    const host = this.config.hl7.host;

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(port, host, () => {
      this.logger.log(
        `MLLP server listening on ${host}:${port} (max connections: ${this.config.hl7.maxConnections})`,
      );
    });

    this.server.on('error', (error) => {
      this.logger.error(`MLLP server error: ${error.message}`);
    });
  }

  private stopServer(): void {
    if (this.server) {
      this.server.close();
      this.logger.log('MLLP server stopped');
    }

    for (const socket of this.connections.values()) {
      socket.destroy();
    }
    this.connections.clear();
  }

  private handleConnection(socket: net.Socket): void {
    const connectionId = this.generateConnectionId(socket);
    this.logger.debug(`New MLLP connection from ${socket.remoteAddress}:${socket.remotePort}`);

    if (this.connections.size >= this.config.hl7.maxConnections) {
      this.logger.warn(
        `Max connections reached (${this.config.hl7.maxConnections}), rejecting connection from ${socket.remoteAddress}`,
      );
      socket.destroy();
      return;
    }

    this.connections.set(connectionId, socket);

    let buffer = Buffer.alloc(0);
    let messageCount = 0;

    const timeout = setTimeout(() => {
      this.logger.debug(`MLLP connection timeout: ${connectionId}`);
      socket.destroy();
    }, this.config.hl7.connectionTimeout);

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      const messages = this.extractMllpMessages(buffer);

      if (messages.processedBytes > 0) {
        buffer = buffer.slice(messages.processedBytes);
      }

      for (const rawMessage of messages.messages) {
        messageCount++;
        this.handleRawMessage(rawMessage, socket, connectionId);
      }
    });

    socket.on('end', () => {
      clearTimeout(timeout);
      this.logger.debug(
        `MLLP connection closed: ${connectionId}, messages received: ${messageCount}`,
      );
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      this.logger.error(`MLLP socket error (${connectionId}): ${error.message}`);
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      this.connections.delete(connectionId);
    });
  }

  private extractMllpMessages(buffer: Buffer): {
    messages: string[];
    processedBytes: number;
  } {
    const messages: string[] = [];
    let processedBytes = 0;
    let searchStart = 0;

    while (searchStart < buffer.length) {
      const startIdx = buffer.indexOf(MLLP_START_BYTE, searchStart);
      if (startIdx === -1) break;

      const endIdx1 = buffer.indexOf(MLLP_END_BYTE_1, startIdx + 1);
      if (endIdx1 === -1) break;

      if (endIdx1 + 1 >= buffer.length) break;
      if (buffer[endIdx1 + 1] !== MLLP_END_BYTE_2) {
        searchStart = endIdx1 + 1;
        continue;
      }

      const messageBuffer = buffer.slice(startIdx + 1, endIdx1);
      const message = messageBuffer.toString('utf8');
      messages.push(message);

      processedBytes = endIdx1 + 2;
      searchStart = endIdx1 + 2;
    }

    return { messages, processedBytes };
  }

  private handleRawMessage(
    rawMessage: string,
    socket: net.Socket,
    connectionId: string,
  ): void {
    try {
      const message = this.hl7Parser.parse(rawMessage);
      const hospitalId = this.hl7Parser.extractHospitalId(message);

      this.logger.log(
        `HL7 message received: ${message.messageTypeFull} ` +
          `from ${connectionId}, ` +
          `patientId=${message.pid.patientId || 'unknown'}`,
      );

      (message as any).hospitalId = hospitalId;

      this.messageSubject.next(message);

      const event: Hl7Event = {
        type: Hl7EventType.MESSAGE_RECEIVED,
        patientId: message.pid.patientId,
        message,
        timestamp: new Date().toISOString(),
        hospitalId,
      };
      this.eventSubject.next(event);

      if (this.config.hl7.autoAcknowledge) {
        this.sendAcknowledgment(socket, message);
      }
    } catch (error) {
      this.logger.error(
        `Error processing HL7 message from ${connectionId}: ${error.message}`,
      );
      if (this.config.hl7.autoAcknowledge) {
        this.sendErrorAcknowledgment(socket, error.message);
      }
    }
  }

  private sendAcknowledgment(socket: net.Socket, message: Hl7Message): void {
    const ackMessage = this.buildAckMessage(message, 'AA', 'Application Accept');
    this.sendMllpMessage(socket, ackMessage);
  }

  private sendErrorAcknowledgment(socket: net.Socket, errorMessage: string): void {
    const ackMessage = this.buildAckMessage(
      null as any,
      'AE',
      errorMessage.substring(0, 80),
    );
    this.sendMllpMessage(socket, ackMessage);
  }

  private buildAckMessage(
    originalMessage: Hl7Message | null,
    ackCode: string,
    textMessage: string,
  ): string {
    const now = new Date();
    const timestamp = this.formatHl7DateTime(now);
    const messageControlId = this.generateMessageControlId();

    const sendingApp = originalMessage?.msh?.receivingApplication || 'ANON_GATEWAY';
    const sendingFacility = originalMessage?.msh?.receivingFacility || 'ANON';
    const receivingApp = originalMessage?.msh?.sendingApplication || '';
    const receivingFacility = originalMessage?.msh?.sendingFacility || '';
    const originalControlId = originalMessage?.msh?.messageControlId || '';
    const version = originalMessage?.msh?.versionId || '2.5';

    const segments: string[] = [];

    segments.push(
      [
        'MSH',
        '^~\\&',
        sendingApp,
        sendingFacility,
        receivingApp,
        receivingFacility,
        timestamp,
        '',
        'ACK',
        messageControlId,
        'P',
        version,
      ].join('|'),
    );

    segments.push(
      [
        'MSA',
        ackCode,
        originalControlId,
        textMessage,
      ].join('|'),
    );

    return segments.join('\r');
  }

  private sendMllpMessage(socket: net.Socket, message: string): void {
    const messageBuffer = Buffer.from(message, 'utf8');
    const frame = Buffer.alloc(messageBuffer.length + 3);
    frame[0] = MLLP_START_BYTE;
    messageBuffer.copy(frame, 1);
    frame[messageBuffer.length + 1] = MLLP_END_BYTE_1;
    frame[messageBuffer.length + 2] = MLLP_END_BYTE_2;

    socket.write(frame);
  }

  private formatHl7DateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  private generateMessageControlId(): string {
    return Math.random().toString(36).substring(2, 15).toUpperCase();
  }

  private generateConnectionId(socket: net.Socket): string {
    return `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 0}-${Date.now()}`;
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public isListening(): boolean {
    return this.server?.listening || false;
  }
}
