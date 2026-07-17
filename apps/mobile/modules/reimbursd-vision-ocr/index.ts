// SPDX-License-Identifier: GPL-3.0-only
import { requireOptionalNativeModule } from 'expo';

interface ReimbursdVisionOcrNativeModule {
  recognizeText(uri: string): Promise<unknown>;
}

let nativeModule: ReimbursdVisionOcrNativeModule | null | undefined;

export function getReimbursdVisionOcrModule(): ReimbursdVisionOcrNativeModule | null {
  nativeModule ??=
    requireOptionalNativeModule<ReimbursdVisionOcrNativeModule>('ReimbursdVisionOcr');
  return nativeModule;
}
