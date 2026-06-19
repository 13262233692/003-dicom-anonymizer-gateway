export enum DicomTagVR {
  AE = 'AE',
  AS = 'AS',
  AT = 'AT',
  CS = 'CS',
  DA = 'DA',
  DS = 'DS',
  DT = 'DT',
  FL = 'FL',
  FD = 'FD',
  IS = 'IS',
  LO = 'LO',
  LT = 'LT',
  OB = 'OB',
  OD = 'OD',
  OF = 'OF',
  OL = 'OL',
  OV = 'OV',
  OW = 'OW',
  PN = 'PN',
  SH = 'SH',
  SL = 'SL',
  SV = 'SV',
  SQ = 'SQ',
  SS = 'SS',
  ST = 'ST',
  TM = 'TM',
  UC = 'UC',
  UI = 'UI',
  UL = 'UL',
  UN = 'UN',
  UR = 'UR',
  US = 'US',
  UT = 'UT',
  UV = 'UV',
}

export interface DicomTag {
  group: number;
  element: number;
  vr: DicomTagVR;
  value: any;
  length: number;
  keyword?: string;
}

export interface ParsedDicomObject {
  tags: Map<string, DicomTag>;
  pixelData?: Buffer;
  transferSyntaxUid: string;
  sopClassUid: string;
  sopInstanceUid: string;
  rawBuffer: Buffer;
}

export type TagKey = string;

export function formatTagKey(group: number, element: number): TagKey {
  return `(${group.toString(16).padStart(4, '0').toUpperCase()},${element.toString(16).padStart(4, '0').toUpperCase()})`;
}

export function parseTagKey(key: TagKey): { group: number; element: number } {
  const match = key.match(/\(([0-9A-Fa-f]{4}),([0-9A-Fa-f]{4})\)/);
  if (!match) {
    throw new Error(`Invalid tag key format: ${key}`);
  }
  return {
    group: parseInt(match[1], 16),
    element: parseInt(match[2], 16),
  };
}
