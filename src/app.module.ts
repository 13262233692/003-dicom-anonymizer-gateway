import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CommonModule } from './common/common.module';
import { DicomModule } from './dicom/dicom.module';
import { ProtocolModule } from './protocol/protocol.module';
import { RedisModule } from './redis/redis.module';
import { RedisRuleService } from './redis/redis-rule.service';
import { AnonymizationModule } from './anonymization/anonymization.module';
import { RoutingModule } from './routing/routing.module';
import { AuditModule } from './audit/audit.module';
import { Hl7Module } from './hl7/hl7.module';
import { GatewayCoordinator } from './gateway-coordinator.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    CommonModule,
    DicomModule,
    ProtocolModule,
    RedisModule,
    AnonymizationModule,
    RoutingModule,
    AuditModule,
    Hl7Module,
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [GatewayCoordinator, RedisRuleService],
  exports: [RedisRuleService],
})
export class AppModule {}
