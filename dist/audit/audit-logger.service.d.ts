import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import configuration from '@common/config/configuration';
import { AuditLogEntry } from '@common/types/anonymization.types';
export declare class AuditLoggerService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private kafka;
    private producer;
    private readonly pendingMessages;
    private isReady;
    constructor(config: ConfigType<typeof configuration>);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<string>;
    private sendMessage;
    private flushPendingMessages;
    private generateId;
    getPendingCount(): number;
    isConnected(): boolean;
}
