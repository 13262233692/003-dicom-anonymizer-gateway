import { Module } from '@nestjs/common';
import { DicomModule } from '@dicom/dicom.module';
import { AnonymizationEngine } from './anonymization-engine.service';

@Module({
  imports: [DicomModule],
  providers: [AnonymizationEngine],
  exports: [AnonymizationEngine],
})
export class AnonymizationModule {}
