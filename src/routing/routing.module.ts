import { Module } from '@nestjs/common';
import { RoutingEngine } from './routing-engine.service';

@Module({
  providers: [RoutingEngine],
  exports: [RoutingEngine],
})
export class RoutingModule {}
