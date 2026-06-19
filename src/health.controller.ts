import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { DicomScpServer } from '@protocol/dicom-scp-server.service';
import { AuditLoggerService } from '@audit/audit-logger.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly configService: ConfigService,
    private readonly dicomScpServer: DicomScpServer,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
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

  @Get('live')
  liveness(): { status: string; timestamp: string } {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness(): { status: string; dicomScp: boolean; kafka: boolean; timestamp: string } {
    return {
      status: this.dicomScpServer.getActiveAssociations() !== undefined ? 'ready' : 'initializing',
      dicomScp: true,
      kafka: this.auditLogger.isConnected(),
      timestamp: new Date().toISOString(),
    };
  }
}
