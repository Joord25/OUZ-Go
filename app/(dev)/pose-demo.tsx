import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OuzPoseView } from '../../modules/OuzPose';
import type {
  CameraPosition,
  PoseDetectionEvent,
  PoseLandmark,
} from '../../modules/OuzPose/src/OuzPose.types';

// Phase 0c-v3: 거리 가이드 + 사람 인식 + 스쿼트 카운트 모드 (PRD 부록 A).
// 스쿼트 알고리즘: hip y 가 무릎 y 위/아래 → state machine → UP→DOWN→UP = 1 rep.
// minRepDuration 0.8s 이상 충족해야 진짜 카운트 (가짜 까딱 차단).

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

// 거리 비율 임계값 (어깨 기준 — 손목보다 작아짐).
const DIST_FAR_THRESHOLD = 0.15;  // 미만 = 멀다
const DIST_NEAR_THRESHOLD = 0.32; // 초과 = 가깝다

// EMA 스무딩 — 새 값 비중. 작을수록 둔감 (안정).
const SMOOTHING_ALPHA = 0.15;

// 사람 인식 체크에 쓰는 핵심 keypoint (어깨 + 엉덩이).
const CORE_BODY_INDICES = [11, 12, 23, 24];
const CORE_LIKELIHOOD_THRESHOLD = 0.5;

type DistanceStatus = 'no_pose' | 'far' | 'ok' | 'near';

type ExerciseMode = 'view' | 'squat';

type SquatState = 'WAITING' | 'UP' | 'DOWN';

// 스쿼트 minRepDuration (PRD 부록 A는 800ms 가설, 실측 후 단축).
const SQUAT_MIN_REP_DURATION_MS = 300;

// 임계점 EMA — 서있을 때 천천히 적응 (사용자 카메라 거리 변화 흡수).
const THRESHOLD_EMA_ALPHA = 0.05;

// 한국어 자연수 (PRD 5-1 "하나, 둘, 셋..." 음성 가이드).
const KOREAN_COUNT_NAMES = [
  '하나', '둘', '셋', '넷', '다섯',
  '여섯', '일곱', '여덟', '아홉', '열',
  '열하나', '열둘', '열셋', '열넷', '열다섯',
  '열여섯', '열일곱', '열여덟', '열아홉', '스물',
  '스물하나', '스물둘', '스물셋', '스물넷', '스물다섯',
  '스물여섯', '스물일곱', '스물여덟', '스물아홉', '서른',
];

function speakCount(n: number) {
  const word = n >= 1 && n <= KOREAN_COUNT_NAMES.length
    ? KOREAN_COUNT_NAMES[n - 1]
    : String(n);
  // 이전 음성 중단 후 새로 발화 — 빠른 카운트도 동기화 유지.
  Speech.stop();
  Speech.speak(word, {
    language: 'ko-KR',
    pitch: 1.1,
    rate: 1.15,
  });
}

function speakMessage(text: string) {
  Speech.stop();
  Speech.speak(text, {
    language: 'ko-KR',
    pitch: 1.0,
    rate: 1.0,
  });
}

export default function PoseDemo() {
  const [pose, setPose] = useState<PoseDetectionEvent | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('back');
  const [smoothedRatio, setSmoothedRatio] = useState<number | null>(null);
  const [mode, setMode] = useState<ExerciseMode>('view');

  // 스쿼트 state machine (ref 로 관리해서 closure stale 회피).
  const [squatCount, setSquatCount] = useState(0);
  const [squatState, setSquatState] = useState<SquatState>('WAITING');
  const [thresholdY, setThresholdY] = useState<number | null>(null);
  const downEnteredAtRef = useRef<number>(0);

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

  // 사람 인식 = 어깨 + 엉덩이 모두 likelihood ≥ 0.5 일 때만 true.
  const isPersonDetected = useMemo(() => {
    if (!pose) return false;
    return CORE_BODY_INDICES.every((i) => {
      const lm = pose.landmarks[i];
      return lm && lm.inFrameLikelihood >= CORE_LIKELIHOOD_THRESHOLD;
    });
  }, [pose]);

  // 어깨 거리 비율 (raw, 매 프레임).
  const rawDistanceRatio: number | null = useMemo(() => {
    if (!pose || !isPersonDetected) return null;
    const ls = pose.landmarks[11];
    const rs = pose.landmarks[12];
    if (!ls || !rs) return null;
    if (pose.frameWidth === 0) return null;
    return Math.abs(rs.x - ls.x) / pose.frameWidth;
  }, [pose, isPersonDetected]);

  // EMA 스무딩.
  useEffect(() => {
    if (rawDistanceRatio === null) {
      setSmoothedRatio(null);
      return;
    }
    setSmoothedRatio((prev) =>
      prev === null
        ? rawDistanceRatio
        : SMOOTHING_ALPHA * rawDistanceRatio + (1 - SMOOTHING_ALPHA) * prev,
    );
  }, [rawDistanceRatio]);

  // 스쿼트 hip / knee y (양쪽 평균).
  const squatGeometry = useMemo(() => {
    if (!pose || !isPersonDetected) return null;
    const lh = pose.landmarks[23];
    const rh = pose.landmarks[24];
    const lk = pose.landmarks[25];
    const rk = pose.landmarks[26];
    if (!lh || !rh || !lk || !rk) return null;
    if (
      lh.inFrameLikelihood < 0.4 ||
      rh.inFrameLikelihood < 0.4 ||
      lk.inFrameLikelihood < 0.4 ||
      rk.inFrameLikelihood < 0.4
    ) {
      return null;
    }
    const hipY = (lh.y + rh.y) / 2;
    const kneeY = (lk.y + rk.y) / 2;
    return { hipY, kneeY };
  }, [pose, isPersonDetected]);

  // 임계 y 설정 — (hip+knee) / 2 중간점.
  // - 처음 인식 시: 즉시 설정
  // - UP 상태: EMA 로 천천히 적응 (사용자 거리 변화 흡수)
  // - DOWN 상태: 잠금 (squat 중에 임계가 따라 내려가지 않게)
  useEffect(() => {
    if (mode !== 'squat' || !squatGeometry) return;
    setThresholdY((prev) => {
      const currentMid = (squatGeometry.hipY + squatGeometry.kneeY) / 2;
      if (prev === null) return currentMid; // 첫 frame
      if (squatState === 'UP') {
        return THRESHOLD_EMA_ALPHA * currentMid + (1 - THRESHOLD_EMA_ALPHA) * prev;
      }
      return prev; // DOWN / WAITING 중에는 잠금
    });
  }, [squatGeometry, squatState, mode]);

  // 스쿼트 state machine.
  useEffect(() => {
    if (mode !== 'squat' || !squatGeometry || thresholdY === null) return;

    // hip y < threshold → 서있음 (UP). hip 이 화면 위쪽 (작은 y) 일수록 서있음.
    const isAboveThreshold = squatGeometry.hipY < thresholdY;
    const now = Date.now();

    setSquatState((prev) => {
      if (prev === 'WAITING' && isAboveThreshold) return 'UP';
      if (prev === 'UP' && !isAboveThreshold) {
        downEnteredAtRef.current = now;
        return 'DOWN';
      }
      if (prev === 'DOWN' && isAboveThreshold) {
        const repDurationMs = now - downEnteredAtRef.current;
        if (repDurationMs >= SQUAT_MIN_REP_DURATION_MS) {
          setSquatCount((c) => c + 1);
        }
        return 'UP';
      }
      return prev;
    });
  }, [squatGeometry, thresholdY, mode]);

  // 모드 변경 시 카운트 + threshold 리셋.
  useEffect(() => {
    if (mode === 'squat') {
      setSquatCount(0);
      setSquatState('WAITING');
      setThresholdY(null);
      downEnteredAtRef.current = 0;
      speakMessage('스쿼트 시작');
    } else {
      Speech.stop();
    }
  }, [mode]);

  // 카운트 변경 시 음성. 0 → 1 부터 발화.
  useEffect(() => {
    if (mode !== 'squat' || squatCount === 0) return;
    speakCount(squatCount);
  }, [squatCount, mode]);

  const distanceStatus: DistanceStatus =
    smoothedRatio === null ? 'no_pose' :
    smoothedRatio < DIST_FAR_THRESHOLD ? 'far' :
    smoothedRatio > DIST_NEAR_THRESHOLD ? 'near' :
    'ok';

  const distanceMessage =
    distanceStatus === 'no_pose' ? '인식 대기 중 — 카메라 앞에 서주세요'
    : distanceStatus === 'far' ? '뒤로 멀어요 — 좀 더 가까이'
    : distanceStatus === 'near' ? '너무 가까워요 — 한 발 뒤로'
    : '적절한 거리입니다 ✓';

  // dot 위치: smoothed ratio 를 0~0.5 범위에서 0~100% 매핑 (어깨 기준).
  const dotPositionPercent = Math.min(
    Math.max(((smoothedRatio ?? 0) / 0.5) * 100, 0),
    100,
  );

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

      {pose && viewSize.width > 0 && isPersonDetected && (
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
          {/* 스쿼트 모드: hip-knee 중간점 임계 가로선 */}
          {mode === 'squat' && thresholdY !== null && (() => {
            const screen = transformLandmark(
              { x: 0, y: thresholdY, z: 0, inFrameLikelihood: 1 },
              pose.frameWidth,
              pose.frameHeight,
            );
            return (
              <Line
                key="squat-threshold"
                p1={vec(0, screen.y)}
                p2={vec(viewSize.width, screen.y)}
                color={squatState === 'DOWN' ? '#00FF88' : '#FFA500'}
                strokeWidth={3}
              />
            );
          })()}
          {/* hip 위치 표시 원 (MissionFit 스타일) */}
          {mode === 'squat' && squatGeometry && (() => {
            const hipScreen = transformLandmark(
              { x: (pose.landmarks[23].x + pose.landmarks[24].x) / 2, y: squatGeometry.hipY, z: 0, inFrameLikelihood: 1 },
              pose.frameWidth,
              pose.frameHeight,
            );
            return (
              <Circle
                key="squat-hip-indicator"
                cx={hipScreen.x}
                cy={hipScreen.y}
                r={20}
                color={squatState === 'DOWN' ? '#00FF88' : '#FFA500'}
                opacity={0.7}
              />
            );
          })()}
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
            {/* 적정 영역 표시 (bar 좌표계는 dot 과 같이 0~0.5 → 0~100%). */}
            <View
              style={[
                styles.distanceOkZone,
                {
                  left: `${(DIST_FAR_THRESHOLD / 0.5) * 100}%`,
                  right: `${(1 - DIST_NEAR_THRESHOLD / 0.5) * 100}%`,
                },
              ]}
            />
            {/* 현재 위치 dot */}
            {smoothedRatio !== null && (
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
          {pose ? `${pose.frameWidth}×${pose.frameHeight}` : '대기'}
          {' · '}
          {isPersonDetected ? `인식 OK · ${visibleLandmarks.length}/33` : '사람 미인식'}
          {smoothedRatio !== null && ` · 어깨 ratio: ${smoothedRatio.toFixed(3)}`}
        </Text>
      </View>

      {/* 스쿼트 카운트 (큰 숫자) */}
      {mode === 'squat' && (
        <View style={styles.squatPanel}>
          <Text style={styles.squatLabel}>스쿼트</Text>
          <Text style={styles.squatCount}>{squatCount}</Text>
          <Text
            style={[
              styles.squatState,
              squatState === 'DOWN' && styles.squatStateDown,
            ]}
          >
            {squatState === 'WAITING' ? '시작 자세 대기' :
             squatState === 'UP' ? '서있음 (UP)' :
             '앉음 (DOWN)'}
          </Text>
        </View>
      )}

      <View style={styles.controlsBar}>
        {/* 운동 모드 토글 */}
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setMode('view')}
            style={[styles.modeButton, mode === 'view' && styles.modeButtonActive]}
          >
            <Text
              style={[
                styles.modeButtonText,
                mode === 'view' && styles.modeButtonTextActive,
              ]}
            >
              보기
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('squat')}
            style={[styles.modeButton, mode === 'squat' && styles.modeButtonActive]}
          >
            <Text
              style={[
                styles.modeButtonText,
                mode === 'squat' && styles.modeButtonTextActive,
              ]}
            >
              스쿼트
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() =>
            setCameraPosition((p) => (p === 'back' ? 'front' : 'back'))
          }
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>
            {cameraPosition === 'back' ? '전면' : '후면'} 카메라
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
    gap: 12,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 4,
    borderRadius: 24,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  modeButtonActive: {
    backgroundColor: '#fff',
  },
  modeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#000',
  },
  toggleButton: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  toggleButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  // 스쿼트 카운트 패널 (우상단, status 박스 아래)
  squatPanel: {
    position: 'absolute',
    top: 180,
    right: 16,
    padding: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    minWidth: 130,
    alignItems: 'center',
  },
  squatLabel: {
    color: '#FFA500',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  squatCount: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 60,
  },
  squatState: {
    color: '#FFA500',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  squatStateDown: {
    color: '#00FF88',
  },
});
