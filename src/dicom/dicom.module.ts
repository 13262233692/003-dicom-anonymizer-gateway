import { Module } from '@nestjs/common';
import { DicomBinaryParser } from './dicom-binary-parser.service';
import { DicomBinaryReconstructor } from './dicom-binary-reconstructor.service';
import { StreamingAnonymizationEngine } from './streaming-anonymization-engine.service';
import { AnonymizationRuleEnhancer } from './anonymization-rule-enhancer.service';

@Module({
  providers: [
    DicomBinaryParser,
    DicomBinaryReconstructor,
    StreamingAnonymizationEngine,
    AnonymizationRuleEnhancer,
  ],
  exports: [
    DicomBinaryParser,
    DicomBinaryReconstructor,
    StreamingAnonymizationEngine,
    AnonymizationRuleEnhancer,
  ],
})
export class DicomModule {}
