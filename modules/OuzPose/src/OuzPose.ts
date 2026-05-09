import { NativeModule, requireNativeModule } from 'expo';

import { OuzPoseEvents } from './OuzPose.types';

declare class OuzPose extends NativeModule<OuzPoseEvents> {
  /**
   * Phase 0a 검증용. ML Kit Pose Detection iOS / Android SDK 가
   * 우리 native module 빌드에 실제로 링크되었는지 확인.
   *
   * 호출 시 PoseDetector 인스턴스 생성 시도 → 성공 시 native SDK
   * 정상 포함됨. 후속 커밋에서 실제 카메라 frame + 33 landmark
   * 추출로 확장.
   */
  getMLKitInfo(): string;

  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<OuzPose>('OuzPose');
