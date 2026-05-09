import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OuzPoseView } from '../../modules/OuzPose';
import type {
  CameraPosition,
  PoseDetectionEvent,
  PoseLandmark,
} from '../../modules/OuzPose/src/OuzPose.types';

// Phase 0b: 실기기 검증.
// - <OuzPoseView>: native 카메라 + ML Kit pose detection
// - onPose 이벤트로 33 landmarks 받음
// - Skia overlay 로 33pt 스켈레톤 그림 (상위 레이어)

// BlazePose 33pt 연결 정의 (스켈레톤 선으로 그릴 쌍).
const CONNECTIONS: [number, number][] = [
  // 어깨
  [11, 12],
  // 좌팔: shoulder → elbow → wrist
  [11, 13], [13, 15],
  // 우팔: shoulder → elbow → wrist
  [12, 14], [14, 16],
  // 어깨-엉덩이
  [11, 23], [12, 24],
  // 엉덩이
  [23, 24],
  // 좌다리: hip → knee → ankle
  [23, 25], [25, 27],
  // 우다리: hip → knee → ankle
  [24, 26], [26, 28],
  // 발: ankle → heel → toe
  [27, 29], [29, 31], [27, 31],
  [28, 30], [30, 32], [28, 32],
];

export default function PoseDemo() {
  const [pose, setPose] = useState<PoseDetectionEvent | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('back');

  // .resizeAspectFill: scale = max → frame 이 view 보다 커지며 가운데 crop.
  // landmark 는 frame 좌표 (회전된 portrait 기준, native 가 rotatedW/H 로 보냄).
  const transformLandmark = (
    lm: PoseLandmark,
    frameW: number,
    frameH: number,
  ) => {
    if (frameW === 0 || frameH === 0 || viewSize.width === 0)
      return { x: 0, y: 0 };
    const scale = Math.max(viewSize.width / frameW, viewSize.height / frameH);
    const displayedW = frameW * scale;
    const displayedH = frameH * scale;
    const offsetX = (viewSize.width - displayedW) / 2;
    const offsetY = (viewSize.height - displayedH) / 2;
    return {
      x: lm.x * scale + offsetX,
      y: lm.y * scale + offsetY,
    };
  };

  const visibleLandmarks =
    pose?.landmarks.filter((lm) => lm.inFrameLikelihood > 0.3) ?? [];

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setViewSize({ width, height });
      }}
    >
      <OuzPoseView
        style={StyleSheet.absoluteFill}
        cameraPosition={cameraPosition}
        onPose={(e) => setPose(e.nativeEvent)}
      />

      {pose && viewSize.width > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          {/* 33 landmark 점 */}
          {pose.landmarks.map((lm, i) => {
            if (lm.inFrameLikelihood < 0.3) return null;
            const p = transformLandmark(lm, pose.frameWidth, pose.frameHeight);
            return (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={5}
                color={lm.inFrameLikelihood > 0.7 ? '#00FF88' : '#FFA500'}
              />
            );
          })}
          {/* 연결 선 */}
          {CONNECTIONS.map(([a, b], i) => {
            const la = pose.landmarks[a];
            const lb = pose.landmarks[b];
            if (!la || !lb) return null;
            if (la.inFrameLikelihood < 0.3 || lb.inFrameLikelihood < 0.3)
              return null;
            const pa = transformLandmark(la, pose.frameWidth, pose.frameHeight);
            const pb = transformLandmark(lb, pose.frameWidth, pose.frameHeight);
            return (
              <Line
                key={`l-${i}`}
                p1={vec(pa.x, pa.y)}
                p2={vec(pb.x, pb.y)}
                color="#00BFFF"
                strokeWidth={2}
              />
            );
          })}
        </Canvas>
      )}

      <View style={styles.statusOverlay}>
        <Text style={styles.statusTitle}>Phase 0b — 카메라 + ML Kit BlazePose</Text>
        <Text style={styles.statusText}>
          Frame: {pose ? `${pose.frameWidth}×${pose.frameHeight}` : '대기 중'}
        </Text>
        <Text style={styles.statusText}>
          Visible landmarks: {visibleLandmarks.length} / 33
        </Text>
        {pose && pose.landmarks[11] && (
          <Text style={styles.statusText}>
            L.Shoulder likelihood: {pose.landmarks[11].inFrameLikelihood.toFixed(2)}
          </Text>
        )}
      </View>

      <View style={styles.controlsBar}>
        <Pressable
          onPress={() =>
            setCameraPosition((p) => (p === 'back' ? 'front' : 'back'))
          }
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>
            {cameraPosition === 'back' ? '전면 카메라' : '후면 카메라'} 로 전환
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusOverlay: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
  },
  statusTitle: {
    color: '#FFA500',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    marginVertical: 2,
  },
  controlsBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toggleButton: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  toggleButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
