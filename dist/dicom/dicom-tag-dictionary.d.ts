import { DicomTagVR } from '@common/types/dicom.types';
export interface TagDictionaryEntry {
    group: number;
    element: number;
    keyword: string;
    vr: DicomTagVR;
    vm: string;
    description: string;
}
export declare const DicomTagDictionary: Record<string, TagDictionaryEntry>;
export declare function lookupTagDictionary(group: number, element: number): TagDictionaryEntry | undefined;
