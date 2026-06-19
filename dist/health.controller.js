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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const terminus_1 = require("@nestjs/terminus");
const dicom_scp_server_service_1 = require("./protocol/dicom-scp-server.service");
const audit_logger_service_1 = require("./audit/audit-logger.service");
let HealthController = class HealthController {
    constructor(health, configService, dicomScpServer, auditLogger) {
        this.health = health;
        this.configService = configService;
        this.dicomScpServer = dicomScpServer;
        this.auditLogger = auditLogger;
    }
    async check() {
        return this.health.check([
            () => ({
                gateway: {
                    status: 'up',
                    details: {
                        nodeEnv: this.configService.get('app.nodeEnv'),
                        version: '1.0.0',
                        uptime: process.uptime(),
                    },
                },
            }),
            () => ({
                dicom_scp: {
                    status: 'up',
                    details: {
                        port: this.configService.get('app.dicomScp.port'),
                        aeTitle: this.configService.get('app.dicomScp.aeTitle'),
                        activeAssociations: this.dicomScpServer.getActiveAssociations().length,
                    },
                },
            }),
            () => ({
                kafka_audit: {
                    status: this.auditLogger.isConnected() ? 'up' : 'down',
                    details: {
                        connected: this.auditLogger.isConnected(),
                        pendingMessages: this.auditLogger.getPendingCount(),
                    },
                },
            }),
        ]);
    }
    liveness() {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
        };
    }
    readiness() {
        return {
            status: this.dicomScpServer.getActiveAssociations() !== undefined ? 'ready' : 'initializing',
            dicomScp: true,
            kafka: this.auditLogger.isConnected(),
            timestamp: new Date().toISOString(),
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, terminus_1.HealthCheck)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('live'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], HealthController.prototype, "liveness", null);
__decorate([
    (0, common_1.Get)('ready'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], HealthController.prototype, "readiness", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        config_1.ConfigService,
        dicom_scp_server_service_1.DicomScpServer,
        audit_logger_service_1.AuditLoggerService])
], HealthController);
//# sourceMappingURL=health.controller.js.map