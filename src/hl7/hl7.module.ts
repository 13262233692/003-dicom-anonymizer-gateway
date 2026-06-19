import { Module, Global } from '@nestjs/common';
import { Hl7ParserService } from './hl7-parser.service';
import { MllpServerService } from './mllp-server.service';
import { PatientStateService } from './patient-state.service';

@Global()
@Module({
  providers: [Hl7ParserService, MllpServerService, PatientStateService],
  exports: [Hl7ParserService, MllpServerService, PatientStateService],
})
export class Hl7Module {}
