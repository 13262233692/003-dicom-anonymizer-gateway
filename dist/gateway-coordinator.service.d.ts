import { OnModuleInit } from '@nestjs/common';
import { DicomScpServer } from '@protocol/dicom-scp-server.service';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import { AnonymizationEngine } from '@anonymization/anonymization-engine.service';
import { RedisRuleService } from '@redis/redis-rule.service';
import { RoutingEngine } from '@routing/routing-engine.service';
import { AuditLoggerService } from '@audit/audit-logger.service';
export declare class GatewayCoordinator implements OnModuleInit {
    private readonly dicomScpServer;
    private readonly dicomParser;
    private readonly anonymizationEngine;
    private readonly redisRuleService;
    private readonly routingEngine;
    private readonly auditLogger;
    private readonly logger;
    constructor(dicomScpServer: DicomScpServer, dicomParser: DicomBinaryParser, anonymizationEngine: AnonymizationEngine, redisRuleService: RedisRuleService, routingEngine: RoutingEngine, auditLogger: AuditLoggerService);
    onModuleInit(): void;
    private handleCStoreRequest;
    private resolveHospitalId;
    private getTagString;
}
