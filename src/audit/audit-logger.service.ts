import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord, logLevel } from 'kafkajs';
import configuration from '@common/config/configuration';
import { AuditLogEntry } from '@common/types/anonymization.types';
import { AuditLogException } from '@common/exceptions/custom.exceptions';

@Injectable()
export class AuditLoggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLoggerService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private readonly pendingMessages: AuditLogEntry[] = [];
  private isReady = false;

  constructor(
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.kafka = new Kafka({
        clientId: this.config.kafka.clientId,
        brokers: this.config.kafka.brokers,
        ssl: this.config.kafka.sslEnabled,
        sasl: this.config.kafka.saslEnabled
          ? {
              mechanism: (this.config.kafka.saslMechanism as any) || 'plain',
              username: this.config.kafka.saslUsername || '',
              password: this.config.kafka.saslPassword || '',
            }
          : undefined,
        logLevel: logLevel.INFO,
        logCreator: () => {
          return ({ level, log }) => {
            const msg = `[Kafka] ${log.message}`;
            switch (level) {
              case logLevel.ERROR:
                this.logger.error(msg);
                break;
              case logLevel.WARN:
                this.logger.warn(msg);
                break;
              default:
                this.logger.debug(msg);
            }
          };
        },
      });

      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });

      this.producer.on('producer.connect', () => {
        this.logger.log('Kafka producer connected');
        this.isReady = true;
        this.flushPendingMessages().catch((e) => this.logger.error(`Flush pending failed: ${e.message}`));
      });

      this.producer.on('producer.disconnect', () => {
        this.logger.warn('Kafka producer disconnected');
        this.isReady = false;
      });

      await this.producer.connect();
      this.logger.log(`Kafka audit logger initialized, topic: ${this.config.kafka.auditTopic}`);
    } catch (error) {
      this.logger.error(`Failed to initialize Kafka producer: ${error.message}`);
      this.logger.warn('Will operate in local buffer mode only');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pendingMessages.length > 0) {
      this.logger.warn(`Flushing ${this.pendingMessages.length} pending audit messages before shutdown`);
      await this.flushPendingMessages();
    }

    if (this.producer) {
      try {
        await this.producer.disconnect();
        this.logger.log('Kafka producer disconnected');
      } catch (error) {
        this.logger.error(`Error disconnecting Kafka producer: ${error.message}`);
      }
    }
  }

  public async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<string> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    if (this.isReady && this.producer) {
      try {
        await this.sendMessage(fullEntry);
      } catch (error) {
        this.logger.warn(`Failed to send audit log directly, queuing: ${error.message}`);
        this.pendingMessages.push(fullEntry);
      }
    } else {
      this.pendingMessages.push(fullEntry);
      if (this.pendingMessages.length > 1000) {
        this.logger.error(`Audit log buffer overflow, dropping oldest entries`);
        this.pendingMessages.splice(0, 100);
      }
    }

    this.logger.debug(
      `Audit logged: [${fullEntry.eventType}] trace=${fullEntry.traceId}, status=${fullEntry.status}`,
    );

    return fullEntry.id;
  }

  private async sendMessage(entry: AuditLogEntry): Promise<void> {
    if (!this.producer) {
      throw new AuditLogException('Kafka producer not available');
    }

    const record: ProducerRecord = {
      topic: this.config.kafka.auditTopic,
      messages: [
        {
          key: entry.traceId || entry.id,
          value: JSON.stringify(entry),
          headers: {
            eventType: entry.eventType,
            status: entry.status,
            hospitalId: entry.hospitalId || '',
            timestamp: entry.timestamp,
          },
        },
      ],
    };

    const result = await this.producer.send(record);

    if (result.length === 0 || result[0].errorCode !== 0) {
      throw new AuditLogException(
        `Kafka send failed with error code: ${result[0]?.errorCode}`,
      );
    }
  }

  private async flushPendingMessages(): Promise<void> {
    if (!this.isReady || !this.producer || this.pendingMessages.length === 0) {
      return;
    }

    this.logger.debug(`Flushing ${this.pendingMessages.length} pending audit messages`);

    const batch = [...this.pendingMessages];
    this.pendingMessages.length = 0;

    const failed: AuditLogEntry[] = [];

    for (const entry of batch) {
      try {
        await this.sendMessage(entry);
      } catch (error) {
        this.logger.error(`Failed to flush audit message ${entry.id}: ${error.message}`);
        failed.push(entry);
      }
    }

    if (failed.length > 0) {
      this.pendingMessages.unshift(...failed);
      this.logger.warn(`${failed.length} audit messages still pending after flush`);
    } else {
      this.logger.log('All pending audit messages flushed successfully');
    }
  }

  private generateId(): string {
    return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  public getPendingCount(): number {
    return this.pendingMessages.length;
  }

  public isConnected(): boolean {
    return this.isReady;
  }
}
