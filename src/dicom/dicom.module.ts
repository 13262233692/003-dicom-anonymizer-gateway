import { Module } from '@nestjs/common';
import { DicomBinaryParser } from './dicom-binary-parser.service';
import { DicomBinaryReconstructor } from './dicom-binary-reconstructor.service';
import { StreamingAnonymizationEngine } from './streaming-anonymization-engine.service';

@Module({
  providers: [DicomBinaryParser, DicomBinaryReconstructor, StreamingAnonymizationEngine],
  exports: [DicomBinaryParser, DicomBinaryReconstructor, StreamingAnonymizationEngine],
})
export class DicomModule {}
