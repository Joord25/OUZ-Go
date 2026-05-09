import type { StyleProp, ViewStyle } from 'react-native';

export type OuzPoseEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

/**
 * BlazePose 33 keypoint. 인덱스 순서 (native 측 landmarkOrder 와 일치):
 *   0: nose
 *   1-3: leftEyeInner, leftEye, leftEyeOuter
 *   4-6: rightEyeInner, rightEye, rightEyeOuter
 *   7-8: leftEar, rightEar
 *   9-10: mouthLeft, mouthRight
 *   11-12: leftShoulder, rightShoulder
 *   13-14: leftElbow, rightElbow
 *   15-16: leftWrist, rightWrist
 *   17-18: leftPinky, rightPinky
 *   19-20: leftIndex, rightIndex
 *   21-22: leftThumb, rightThumb
 *   23-24: leftHip, rightHip
 *   25-26: leftKnee, rightKnee
 *   27-28: leftAnkle, rightAnkle
 *   29-30: leftHeel, rightHeel
 *   31-32: leftToe, rightToe
 */
export type PoseLandmark = {
  /** Pixel x in source frame coordinate system (0 ~ frameWidth). */
  x: number;
  /** Pixel y in source frame coordinate system (0 ~ frameHeight). */
  y: number;
  /** Depth z (relative). */
  z: number;
  /** 0 ~ 1. 0.5 이상이면 신뢰. */
  inFrameLikelihood: number;
};

export type PoseDetectionEvent = {
  landmarks: PoseLandmark[];
  /** Landmark x,y 좌표가 정의된 source frame 가로. */
  frameWidth: number;
  /** Landmark x,y 좌표가 정의된 source frame 세로. */
  frameHeight: number;
};

export type OuzPoseViewProps = {
  style?: StyleProp<ViewStyle>;
  onPose?: (event: { nativeEvent: PoseDetectionEvent }) => void;
};
