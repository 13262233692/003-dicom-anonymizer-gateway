import { DicomTagVR } from '@common/types/dicom.types';

export interface TagDictionaryEntry {
  group: number;
  element: number;
  keyword: string;
  vr: DicomTagVR;
  vm: string;
  description: string;
}

export const DicomTagDictionary: Record<string, TagDictionaryEntry> = {
  '(0002,0000)': { group: 0x0002, element: 0x0000, keyword: 'FileMetaInformationGroupLength', vr: DicomTagVR.UL, vm: '1', description: 'File Meta Information Group Length' },
  '(0002,0001)': { group: 0x0002, element: 0x0001, keyword: 'FileMetaInformationVersion', vr: DicomTagVR.OB, vm: '1', description: 'File Meta Information Version' },
  '(0002,0002)': { group: 0x0002, element: 0x0002, keyword: 'MediaStorageSOPClassUID', vr: DicomTagVR.UI, vm: '1', description: 'Media Storage SOP Class UID' },
  '(0002,0003)': { group: 0x0002, element: 0x0003, keyword: 'MediaStorageSOPInstanceUID', vr: DicomTagVR.UI, vm: '1', description: 'Media Storage SOP Instance UID' },
  '(0002,0010)': { group: 0x0002, element: 0x0010, keyword: 'TransferSyntaxUID', vr: DicomTagVR.UI, vm: '1', description: 'Transfer Syntax UID' },
  '(0002,0012)': { group: 0x0002, element: 0x0012, keyword: 'ImplementationClassUID', vr: DicomTagVR.UI, vm: '1', description: 'Implementation Class UID' },
  '(0002,0013)': { group: 0x0002, element: 0x0013, keyword: 'ImplementationVersionName', vr: DicomTagVR.SH, vm: '1', description: 'Implementation Version Name' },
  '(0008,0005)': { group: 0x0008, element: 0x0005, keyword: 'SpecificCharacterSet', vr: DicomTagVR.CS, vm: '1-n', description: 'Specific Character Set' },
  '(0008,0008)': { group: 0x0008, element: 0x0008, keyword: 'ImageType', vr: DicomTagVR.CS, vm: '2-n', description: 'Image Type' },
  '(0008,0016)': { group: 0x0008, element: 0x0016, keyword: 'SOPClassUID', vr: DicomTagVR.UI, vm: '1', description: 'SOP Class UID' },
  '(0008,0018)': { group: 0x0008, element: 0x0018, keyword: 'SOPInstanceUID', vr: DicomTagVR.UI, vm: '1', description: 'SOP Instance UID' },
  '(0008,0020)': { group: 0x0008, element: 0x0020, keyword: 'StudyDate', vr: DicomTagVR.DA, vm: '1', description: 'Study Date' },
  '(0008,0021)': { group: 0x0008, element: 0x0021, keyword: 'SeriesDate', vr: DicomTagVR.DA, vm: '1', description: 'Series Date' },
  '(0008,0022)': { group: 0x0008, element: 0x0022, keyword: 'AcquisitionDate', vr: DicomTagVR.DA, vm: '1', description: 'Acquisition Date' },
  '(0008,0023)': { group: 0x0008, element: 0x0023, keyword: 'ContentDate', vr: DicomTagVR.DA, vm: '1', description: 'Content Date' },
  '(0008,0030)': { group: 0x0008, element: 0x0030, keyword: 'StudyTime', vr: DicomTagVR.TM, vm: '1', description: 'Study Time' },
  '(0008,0031)': { group: 0x0008, element: 0x0031, keyword: 'SeriesTime', vr: DicomTagVR.TM, vm: '1', description: 'Series Time' },
  '(0008,0050)': { group: 0x0008, element: 0x0050, keyword: 'AccessionNumber', vr: DicomTagVR.SH, vm: '1', description: 'Accession Number' },
  '(0008,0060)': { group: 0x0008, element: 0x0060, keyword: 'Modality', vr: DicomTagVR.CS, vm: '1', description: 'Modality' },
  '(0008,0070)': { group: 0x0008, element: 0x0070, keyword: 'Manufacturer', vr: DicomTagVR.LO, vm: '1', description: 'Manufacturer' },
  '(0008,0080)': { group: 0x0008, element: 0x0080, keyword: 'InstitutionName', vr: DicomTagVR.LO, vm: '1', description: 'Institution Name' },
  '(0008,0090)': { group: 0x0008, element: 0x0090, keyword: 'ReferringPhysicianName', vr: DicomTagVR.PN, vm: '1', description: 'Referring Physician Name' },
  '(0008,1010)': { group: 0x0008, element: 0x1010, keyword: 'StationName', vr: DicomTagVR.SH, vm: '1', description: 'Station Name' },
  '(0008,1030)': { group: 0x0008, element: 0x1030, keyword: 'StudyDescription', vr: DicomTagVR.LO, vm: '1', description: 'Study Description' },
  '(0008,103E)': { group: 0x0008, element: 0x103e, keyword: 'SeriesDescription', vr: DicomTagVR.LO, vm: '1', description: 'Series Description' },
  '(0008,1040)': { group: 0x0008, element: 0x1040, keyword: 'InstitutionalDepartmentName', vr: DicomTagVR.LO, vm: '1', description: 'Institutional Department Name' },
  '(0008,1050)': { group: 0x0008, element: 0x1050, keyword: 'PerformingPhysicianName', vr: DicomTagVR.PN, vm: '1', description: 'Performing Physician Name' },
  '(0008,1060)': { group: 0x0008, element: 0x1060, keyword: 'NameOfPhysiciansReadingStudy', vr: DicomTagVR.PN, vm: '1-n', description: 'Name Of Physicians Reading Study' },
  '(0008,1070)': { group: 0x0008, element: 0x1070, keyword: 'OperatorsName', vr: DicomTagVR.PN, vm: '1-n', description: 'Operators Name' },
  '(0008,1110)': { group: 0x0008, element: 0x1110, keyword: 'ReferencedStudySequence', vr: DicomTagVR.SQ, vm: '1', description: 'Referenced Study Sequence' },
  '(0008,1115)': { group: 0x0008, element: 0x1115, keyword: 'ReferencedSeriesSequence', vr: DicomTagVR.SQ, vm: '1', description: 'Referenced Series Sequence' },
  '(0010,0010)': { group: 0x0010, element: 0x0010, keyword: 'PatientName', vr: DicomTagVR.PN, vm: '1', description: 'Patient Name' },
  '(0010,0020)': { group: 0x0010, element: 0x0020, keyword: 'PatientID', vr: DicomTagVR.LO, vm: '1', description: 'Patient ID' },
  '(0010,0030)': { group: 0x0010, element: 0x0030, keyword: 'PatientBirthDate', vr: DicomTagVR.DA, vm: '1', description: 'Patient Birth Date' },
  '(0010,0032)': { group: 0x0010, element: 0x0032, keyword: 'PatientBirthTime', vr: DicomTagVR.TM, vm: '1', description: 'Patient Birth Time' },
  '(0010,0040)': { group: 0x0010, element: 0x0040, keyword: 'PatientSex', vr: DicomTagVR.CS, vm: '1', description: 'Patient Sex' },
  '(0010,1000)': { group: 0x0010, element: 0x1000, keyword: 'OtherPatientIDs', vr: DicomTagVR.LO, vm: '1-n', description: 'Other Patient IDs' },
  '(0010,1001)': { group: 0x0010, element: 0x1001, keyword: 'OtherPatientNames', vr: DicomTagVR.PN, vm: '1-n', description: 'Other Patient Names' },
  '(0010,1005)': { group: 0x0010, element: 0x1005, keyword: 'PatientBirthName', vr: DicomTagVR.PN, vm: '1', description: 'Patient Birth Name' },
  '(0010,1010)': { group: 0x0010, element: 0x1010, keyword: 'PatientAge', vr: DicomTagVR.AS, vm: '1', description: 'Patient Age' },
  '(0010,1020)': { group: 0x0010, element: 0x1020, keyword: 'PatientSize', vr: DicomTagVR.DS, vm: '1', description: 'Patient Size' },
  '(0010,1030)': { group: 0x0010, element: 0x1030, keyword: 'PatientWeight', vr: DicomTagVR.DS, vm: '1', description: 'Patient Weight' },
  '(0010,1040)': { group: 0x0010, element: 0x1040, keyword: 'PatientAddress', vr: DicomTagVR.LO, vm: '1', description: 'Patient Address' },
  '(0010,1050)': { group: 0x0010, element: 0x1050, keyword: 'InsurancePlanIdentification', vr: DicomTagVR.LO, vm: '1', description: 'Insurance Plan Identification' },
  '(0010,1060)': { group: 0x0010, element: 0x1060, keyword: 'PatientMotherBirthName', vr: DicomTagVR.PN, vm: '1', description: "Patient's Mother Birth Name" },
  '(0010,1080)': { group: 0x0010, element: 0x1080, keyword: 'MilitaryRank', vr: DicomTagVR.LO, vm: '1', description: 'Military Rank' },
  '(0010,1081)': { group: 0x0010, element: 0x1081, keyword: 'BranchOfService', vr: DicomTagVR.LO, vm: '1', description: 'Branch of Service' },
  '(0010,1090)': { group: 0x0010, element: 0x1090, keyword: 'MedicalRecordLocator', vr: DicomTagVR.LO, vm: '1', description: 'Medical Record Locator' },
  '(0010,2000)': { group: 0x0010, element: 0x2000, keyword: 'MedicalAlerts', vr: DicomTagVR.LO, vm: '1-n', description: 'Medical Alerts' },
  '(0010,2110)': { group: 0x0010, element: 0x2110, keyword: 'Allergies', vr: DicomTagVR.LO, vm: '1-n', description: 'Allergies' },
  '(0010,2150)': { group: 0x0010, element: 0x2150, keyword: 'CountryOfResidence', vr: DicomTagVR.LO, vm: '1', description: 'Country Of Residence' },
  '(0010,2152)': { group: 0x0010, element: 0x2152, keyword: 'RegionOfResidence', vr: DicomTagVR.LO, vm: '1', description: 'Region Of Residence' },
  '(0010,2154)': { group: 0x0010, element: 0x2154, keyword: 'PatientTelephoneNumbers', vr: DicomTagVR.LO, vm: '1-n', description: 'Patient Telephone Numbers' },
  '(0010,2160)': { group: 0x0010, element: 0x2160, keyword: 'EthnicGroup', vr: DicomTagVR.SH, vm: '1', description: 'Ethnic Group' },
  '(0010,2180)': { group: 0x0010, element: 0x2180, keyword: 'Occupation', vr: DicomTagVR.LO, vm: '1', description: 'Occupation' },
  '(0010,21B0)': { group: 0x0010, element: 0x21b0, keyword: 'AdditionalPatientHistory', vr: DicomTagVR.LT, vm: '1', description: 'Additional Patient History' },
  '(0010,4000)': { group: 0x0010, element: 0x4000, keyword: 'PatientComments', vr: DicomTagVR.LT, vm: '1', description: 'Patient Comments' },
  '(0018,0030)': { group: 0x0018, element: 0x0030, keyword: 'BodyPartExamined', vr: DicomTagVR.CS, vm: '1', description: 'Body Part Examined' },
  '(0018,1030)': { group: 0x0018, element: 0x1030, keyword: 'ProtocolName', vr: DicomTagVR.LO, vm: '1', description: 'Protocol Name' },
  '(0018,5100)': { group: 0x0018, element: 0x5100, keyword: 'PatientPosition', vr: DicomTagVR.CS, vm: '1', description: 'Patient Position' },
  '(0020,000D)': { group: 0x0020, element: 0x000d, keyword: 'StudyInstanceUID', vr: DicomTagVR.UI, vm: '1', description: 'Study Instance UID' },
  '(0020,000E)': { group: 0x0020, element: 0x000e, keyword: 'SeriesInstanceUID', vr: DicomTagVR.UI, vm: '1', description: 'Series Instance UID' },
  '(0020,0010)': { group: 0x0020, element: 0x0010, keyword: 'StudyID', vr: DicomTagVR.SH, vm: '1', description: 'Study ID' },
  '(0020,0011)': { group: 0x0020, element: 0x0011, keyword: 'SeriesNumber', vr: DicomTagVR.IS, vm: '1', description: 'Series Number' },
  '(0020,0012)': { group: 0x0020, element: 0x0012, keyword: 'AcquisitionNumber', vr: DicomTagVR.IS, vm: '1', description: 'Acquisition Number' },
  '(0020,0013)': { group: 0x0020, element: 0x0013, keyword: 'InstanceNumber', vr: DicomTagVR.IS, vm: '1', description: 'Instance Number' },
  '(0020,0020)': { group: 0x0020, element: 0x0020, keyword: 'PatientOrientation', vr: DicomTagVR.CS, vm: '2', description: 'Patient Orientation' },
  '(0028,0002)': { group: 0x0028, element: 0x0002, keyword: 'SamplesPerPixel', vr: DicomTagVR.US, vm: '1', description: 'Samples Per Pixel' },
  '(0028,0004)': { group: 0x0028, element: 0x0004, keyword: 'PhotometricInterpretation', vr: DicomTagVR.CS, vm: '1', description: 'Photometric Interpretation' },
  '(0028,0010)': { group: 0x0028, element: 0x0010, keyword: 'Rows', vr: DicomTagVR.US, vm: '1', description: 'Rows' },
  '(0028,0011)': { group: 0x0028, element: 0x0011, keyword: 'Columns', vr: DicomTagVR.US, vm: '1', description: 'Columns' },
  '(0028,0100)': { group: 0x0028, element: 0x0100, keyword: 'BitsAllocated', vr: DicomTagVR.US, vm: '1', description: 'Bits Allocated' },
  '(0028,0101)': { group: 0x0028, element: 0x0101, keyword: 'BitsStored', vr: DicomTagVR.US, vm: '1', description: 'Bits Stored' },
  '(0028,0102)': { group: 0x0028, element: 0x0102, keyword: 'HighBit', vr: DicomTagVR.US, vm: '1', description: 'High Bit' },
  '(0028,0103)': { group: 0x0028, element: 0x0103, keyword: 'PixelRepresentation', vr: DicomTagVR.US, vm: '1', description: 'Pixel Representation' },
  '(7FE0,0010)': { group: 0x7fe0, element: 0x0010, keyword: 'PixelData', vr: DicomTagVR.OW, vm: '1', description: 'Pixel Data' },
};

export function lookupTagDictionary(
  group: number,
  element: number,
): TagDictionaryEntry | undefined {
  const key = `(${group.toString(16).padStart(4, '0').toUpperCase()},${element.toString(16).padStart(4, '0').toUpperCase()})`;
  return DicomTagDictionary[key];
}
