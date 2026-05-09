import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OuzPoseView } from '../../modules/OuzPose';
import type {
  CameraPosition,
  PoseDetectionEvent,
  PoseLandmark,
} from '../../modules/OuzPose/src/OuzPose.types';

// Phase 0c: 거리 가이드 바 추가 (PRD 6-3).
//  - 양 손목 (15, 16) 사이 거리 / frame width = 거리 비율
//  - 0.40~0.85 = 적절 / 그 외 = 멀다 or 가깝다
//  - 참조 MissionFit 패턴: 상단 가로 막대 + 좌우 멀다/가깝다 라벨 + 적정 시 녹색

const CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31],
  [28, 30], [30, 32], [28, 32],
];

// 거리 비율 임계값.
const DIST_FAR_THRESHOLD = 0.4;   // 미만 = 멀다
const DIST_NEAR_THRESHOLD = 0.6;  // 초과 = 가깝다

type DistanceStatus = 'no_pose' | 'far' | 'ok' | 'near';

export default function PoseDemo() {
  const [pose, setPose] = useState<PoseDetectionEvent | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('back');

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

  // 거리 비율: 양 손목 (15: leftWrist, 16: rightWrist) frame x 거리 / frameWidth.
  const distanceRatio: number | null = useMemo(() => {
    if (!pose) return null;
    const lw = pose.landmarks[15];
    const rw = pose.landmarks[16];
    if (!lw || !rw) return null;
    if (lw.inFrameLikelihood < 0.3 || rw.inFrameLikelihood < 0.3) return null;
    if (pose.frameWidth === 0) return null;
    return Math.abs(rw.x - lw.x) / pose.frameWidth;
  }, [pose]);

  const distanceStatus: DistanceStatus =
    distanceRatio === null ? 'no_pose' :
    distanceRatio < DIST_FAR_THRESHOLD ? 'far' :
    distanceRatio > DIST_NEAR_THRESHOLD ? 'near' :
    'ok';

  const distanceMessage =
    distanceStatus === 'no_pose' ? '인식 대기 중 — 카메라 앞에 서주세요'
    : distanceStatus === 'far' ? '뒤로 멀어요 — 좀 더 가까이 + 팔을 옆으로 펼치세요'
    : distanceStatus === 'near' ? '너무 가까워요 — 한 발 뒤로'
    : '적절한 거리입니다 ✓';

  // 막대 위에 점이 위치할 비율 (0~1, 0=멀다 끝, 1=가깝다 끝).
  // 손목 비율 0~1 → bar 0~100% 그대로.
  const dotPositionPercent = Math.min(Math.max((distanceRatio ?? 0) * 100, 0), 100);

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

      {/* 거리 가이드 바 (PRD 6-3) */}
      <View
        style={[
          styles.distanceBar,
          distanceStatus === 'ok' && styles.distanceBarOk,
          distanceStatus === 'no_pose' && styles.distanceBarMuted,
        ]}
      >
        <Text style={styles.distanceMessage}>{distanceMessage}</Text>
        <View style={styles.distanceTrackRow}>
          <Text style={styles.distanceLabel}>멀다</Text>
          <View style={styles.distanceTrack}>
            {/* 적정 영역 표시 */}
            <View
              style={[
                styles.distanceOkZone,
                {
                  left: `${DIST_FAR_THRESHOLD * 100}%`,
                  right: `${(1 - DIST_NEAR_THRESHOLD) * 100}%`,
                },
              ]}
            />
            {/* 현재 위치 dot */}
            {distanceRatio !== null && (
              <View
                style={[
                  styles.distanceDot,
                  { left: `${dotPositionPercent}%` },
                ]}
              />
            )}
          </View>
          <Text style={styles.distanceLabel}>가깝다</Text>
        </View>
      </View>

      <View style={styles.statusOverlay}>
        <Text style={styles.statusText}>
          Frame: {pose ? `${pose.frameWidth}×${pose.frameHeight}` : '대기 중'}
          {' · '}
          Visible: {visibleLandmarks.length}/33
          {distanceRatio !== null && ` · ratio: ${distanceRatio.toFixed(2)}`}
        </Text>
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
  // 거리 가이드 바 (상단)
  distanceBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 130, 60, 0.92)', // 기본 (이상) = 주황
  },
  distanceBarOk: {
    backgroundColor: 'rgba(46, 160, 90, 0.92)', // OK = 녹색
  },
  distanceBarMuted: {
    backgroundColor: 'rgba(80, 80, 80, 0.85)', // 인식 X = 회색
  },
  distanceMessage: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  distanceTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  distanceLabel: {
    color: '#fff',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
  distanceTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    position: 'relative',
  },
  distanceOkZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 3,
  },
  distanceDot: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    transform: [{ translateX: -8 }],
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.4)',
  },
  // 디버그 status (작게, 거리 바 아래)
  statusOverlay: {
    position: 'absolute',
    top: 130,
    left: 16,
    right: 16,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
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
