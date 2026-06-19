"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MllpServerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MllpServerService = void 0;
const common_1 = require("@nestjs/common");
const net = __importStar(require("net"));
const rxjs_1 = require("rxjs");
const configuration_1 = __importDefault(require("../common/config/configuration"));
const hl7_parser_service_1 = require("./hl7-parser.service");
const hl7_types_1 = require("../common/types/hl7.types");
const MLLP_START_BYTE = 0x0b;
const MLLP_END_BYTE_1 = 0x1c;
const MLLP_END_BYTE_2 = 0x0d;
let MllpServerService = MllpServerService_1 = class MllpServerService {
    constructor(config, hl7Parser) {
        this.config = config;
        this.hl7Parser = hl7Parser;
        this.logger = new common_1.Logger(MllpServerService_1.name);
        this.server = null;
        this.connections = new Map();
        this.messageSubject = new rxjs_1.Subject();
        this.eventSubject = new rxjs_1.Subject();
    }
    onModuleInit() {
        this.startServer();
    }
    onModuleDestroy() {
        this.stopServer();
    }
    get messages$() {
        return this.messageSubject.asObservable();
    }
    get events$() {
        return this.eventSubject.asObservable();
    }
    startServer() {
        const port = this.config.hl7.port;
        const host = this.config.hl7.host;
        this.server = net.createServer((socket) => {
            this.handleConnection(socket);
        });
        this.server.listen(port, host, () => {
            this.logger.log(`MLLP server listening on ${host}:${port} (max connections: ${this.config.hl7.maxConnections})`);
        });
        this.server.on('error', (error) => {
            this.logger.error(`MLLP server error: ${error.message}`);
        });
    }
    stopServer() {
        if (this.server) {
            this.server.close();
            this.logger.log('MLLP server stopped');
        }
        for (const socket of this.connections.values()) {
            socket.destroy();
        }
        this.connections.clear();
    }
    handleConnection(socket) {
        const connectionId = this.generateConnectionId(socket);
        this.logger.debug(`New MLLP connection from ${socket.remoteAddress}:${socket.remotePort}`);
        if (this.connections.size >= this.config.hl7.maxConnections) {
            this.logger.warn(`Max connections reached (${this.config.hl7.maxConnections}), rejecting connection from ${socket.remoteAddress}`);
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
            this.logger.debug(`MLLP connection closed: ${connectionId}, messages received: ${messageCount}`);
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
    extractMllpMessages(buffer) {
        const messages = [];
        let processedBytes = 0;
        let searchStart = 0;
        while (searchStart < buffer.length) {
            const startIdx = buffer.indexOf(MLLP_START_BYTE, searchStart);
            if (startIdx === -1)
                break;
            const endIdx1 = buffer.indexOf(MLLP_END_BYTE_1, startIdx + 1);
            if (endIdx1 === -1)
                break;
            if (endIdx1 + 1 >= buffer.length)
                break;
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
    handleRawMessage(rawMessage, socket, connectionId) {
        try {
            const message = this.hl7Parser.parse(rawMessage);
            const hospitalId = this.hl7Parser.extractHospitalId(message);
            this.logger.log(`HL7 message received: ${message.messageTypeFull} ` +
                `from ${connectionId}, ` +
                `patientId=${message.pid.patientId || 'unknown'}`);
            message.hospitalId = hospitalId;
            this.messageSubject.next(message);
            const event = {
                type: hl7_types_1.Hl7EventType.MESSAGE_RECEIVED,
                patientId: message.pid.patientId,
                message,
                timestamp: new Date().toISOString(),
                hospitalId,
            };
            this.eventSubject.next(event);
            if (this.config.hl7.autoAcknowledge) {
                this.sendAcknowledgment(socket, message);
            }
        }
        catch (error) {
            this.logger.error(`Error processing HL7 message from ${connectionId}: ${error.message}`);
            if (this.config.hl7.autoAcknowledge) {
                this.sendErrorAcknowledgment(socket, error.message);
            }
        }
    }
    sendAcknowledgment(socket, message) {
        const ackMessage = this.buildAckMessage(message, 'AA', 'Application Accept');
        this.sendMllpMessage(socket, ackMessage);
    }
    sendErrorAcknowledgment(socket, errorMessage) {
        const ackMessage = this.buildAckMessage(null, 'AE', errorMessage.substring(0, 80));
        this.sendMllpMessage(socket, ackMessage);
    }
    buildAckMessage(originalMessage, ackCode, textMessage) {
        const now = new Date();
        const timestamp = this.formatHl7DateTime(now);
        const messageControlId = this.generateMessageControlId();
        const sendingApp = originalMessage?.msh?.receivingApplication || 'ANON_GATEWAY';
        const sendingFacility = originalMessage?.msh?.receivingFacility || 'ANON';
        const receivingApp = originalMessage?.msh?.sendingApplication || '';
        const receivingFacility = originalMessage?.msh?.sendingFacility || '';
        const originalControlId = originalMessage?.msh?.messageControlId || '';
        const version = originalMessage?.msh?.versionId || '2.5';
        const segments = [];
        segments.push([
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
        ].join('|'));
        segments.push([
            'MSA',
            ackCode,
            originalControlId,
            textMessage,
        ].join('|'));
        return segments.join('\r');
    }
    sendMllpMessage(socket, message) {
        const messageBuffer = Buffer.from(message, 'utf8');
        const frame = Buffer.alloc(messageBuffer.length + 3);
        frame[0] = MLLP_START_BYTE;
        messageBuffer.copy(frame, 1);
        frame[messageBuffer.length + 1] = MLLP_END_BYTE_1;
        frame[messageBuffer.length + 2] = MLLP_END_BYTE_2;
        socket.write(frame);
    }
    formatHl7DateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
    generateMessageControlId() {
        return Math.random().toString(36).substring(2, 15).toUpperCase();
    }
    generateConnectionId(socket) {
        return `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 0}-${Date.now()}`;
    }
    getConnectionCount() {
        return this.connections.size;
    }
    isListening() {
        return this.server?.listening || false;
    }
};
exports.MllpServerService = MllpServerService;
exports.MllpServerService = MllpServerService = MllpServerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.default.KEY)),
    __metadata("design:paramtypes", [void 0, hl7_parser_service_1.Hl7ParserService])
], MllpServerService);
//# sourceMappingURL=mllp-server.service.js.map