import { ConfigService } from '@nestjs/config';
import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { DicomScpServer } from '@protocol/dicom-scp-server.service';
import { AuditLoggerService } from '@audit/audit-logger.service';
export declare class HealthController {
    private readonly health;
    private readonly configService;
    private readonly dicomScpServer;
    private readonly auditLogger;
    constructor(health: HealthCheckService, configService: ConfigService, dicomScpServer: DicomScpServer, auditLogger: AuditLoggerService);
    check(): Promise<HealthCheckResult>;
    liveness(): {
        status: string;
        timestamp: string;
    };
    readiness(): {
        status: string;
        dicomScp: boolean;
        kafka: boolean;
        timestamp: string;
    };
}
