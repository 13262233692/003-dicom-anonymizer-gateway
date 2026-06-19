import { Module } from '@nestjs/common';
import { DicomBinaryParser } from './dicom-binary-parser.service';
import { DicomBinaryReconstructor } from './dicom-binary-reconstructor.service';

@Module({
  providers: [DicomBinaryParser, DicomBinaryReconstructor],
  exports: [DicomBinaryParser, DicomBinaryReconstructor],
})
export class DicomModule {}
