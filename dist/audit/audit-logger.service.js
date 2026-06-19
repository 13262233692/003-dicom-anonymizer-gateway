"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuditLoggerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLoggerService = void 0;
const common_1 = require("@nestjs/common");
const kafkajs_1 = require("kafkajs");
const configuration_1 = __importDefault(require("../common/config/configuration"));
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
let AuditLoggerService = AuditLoggerService_1 = class AuditLoggerService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(AuditLoggerService_1.name);
        this.kafka = null;
        this.producer = null;
        this.pendingMessages = [];
        this.isReady = false;
    }
    async onModuleInit() {
        try {
            this.kafka = new kafkajs_1.Kafka({
                clientId: this.config.kafka.clientId,
                brokers: this.config.kafka.brokers,
                ssl: this.config.kafka.sslEnabled,
                sasl: this.config.kafka.saslEnabled
                    ? {
                        mechanism: this.config.kafka.saslMechanism || 'plain',
                        username: this.config.kafka.saslUsername || '',
                        password: this.config.kafka.saslPassword || '',
                    }
                    : undefined,
                logLevel: kafkajs_1.logLevel.INFO,
                logCreator: () => {
                    return ({ level, log }) => {
                        const msg = `[Kafka] ${log.message}`;
                        switch (level) {
                            case kafkajs_1.logLevel.ERROR:
                                this.logger.error(msg);
                                break;
                            case kafkajs_1.logLevel.WARN:
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
        }
        catch (error) {
            this.logger.error(`Failed to initialize Kafka producer: ${error.message}`);
            this.logger.warn('Will operate in local buffer mode only');
        }
    }
    async onModuleDestroy() {
        if (this.pendingMessages.length > 0) {
            this.logger.warn(`Flushing ${this.pendingMessages.length} pending audit messages before shutdown`);
            await this.flushPendingMessages();
        }
        if (this.producer) {
            try {
                await this.producer.disconnect();
                this.logger.log('Kafka producer disconnected');
            }
            catch (error) {
                this.logger.error(`Error disconnecting Kafka producer: ${error.message}`);
            }
        }
    }
    async log(entry) {
        const fullEntry = {
            ...entry,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
        };
        if (this.isReady && this.producer) {
            try {
                await this.sendMessage(fullEntry);
            }
            catch (error) {
                this.logger.warn(`Failed to send audit log directly, queuing: ${error.message}`);
                this.pendingMessages.push(fullEntry);
            }
        }
        else {
            this.pendingMessages.push(fullEntry);
            if (this.pendingMessages.length > 1000) {
                this.logger.error(`Audit log buffer overflow, dropping oldest entries`);
                this.pendingMessages.splice(0, 100);
            }
        }
        this.logger.debug(`Audit logged: [${fullEntry.eventType}] trace=${fullEntry.traceId}, status=${fullEntry.status}`);
        return fullEntry.id;
    }
    async sendMessage(entry) {
        if (!this.producer) {
            throw new custom_exceptions_1.AuditLogException('Kafka producer not available');
        }
        const record = {
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
            throw new custom_exceptions_1.AuditLogException(`Kafka send failed with error code: ${result[0]?.errorCode}`);
        }
    }
    async flushPendingMessages() {
        if (!this.isReady || !this.producer || this.pendingMessages.length === 0) {
            return;
        }
        this.logger.debug(`Flushing ${this.pendingMessages.length} pending audit messages`);
        const batch = [...this.pendingMessages];
        this.pendingMessages.length = 0;
        const failed = [];
        for (const entry of batch) {
            try {
                await this.sendMessage(entry);
            }
            catch (error) {
                this.logger.error(`Failed to flush audit message ${entry.id}: ${error.message}`);
                failed.push(entry);
            }
        }
        if (failed.length > 0) {
            this.pendingMessages.unshift(...failed);
            this.logger.warn(`${failed.length} audit messages still pending after flush`);
        }
        else {
            this.logger.log('All pending audit messages flushed successfully');
        }
    }
    generateId() {
        return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
    getPendingCount() {
        return this.pendingMessages.length;
    }
    isConnected() {
        return this.isReady;
    }
};
exports.AuditLoggerService = AuditLoggerService;
exports.AuditLoggerService = AuditLoggerService = AuditLoggerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.default.KEY)),
    __metadata("design:paramtypes", [void 0])
], AuditLoggerService);
//# sourceMappingURL=audit-logger.service.js.map