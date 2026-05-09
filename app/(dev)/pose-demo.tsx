import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type SessionState = 'idle' | 'countdown' | 'active' | 'complete';

// PRD 5-1: 30초 시간 기반 세션 + 3초 사전 카운트다운 (T자세 트리거 후).
const PRE_COUNTDOWN_SEC = 3;
const ACTIVE_SESSION_SEC = 30;
const FINAL_COUNTDOWN_VOICE_SEC = 5; // 마지막 N초 음성 카운트다운

// T자세 트리거 — 양 손목 어깨 높이 + 어깨 밖으로 펼침 + 1.5초 유지.
const T_POSE_HOLD_MS = 1500;
const T_POSE_Y_TOLERANCE_RATIO = 0.08; // 손목/팔꿈치가 어깨 ±8% (frameH 기준)

// 카운트 사이 최대 허용 간격 (이 시간 내 다음 rep 없으면 "중단").
const REP_GAP_TIMEOUT_MS = 4000;

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
  // 한국식 운동 카운트 cadence: "하나 둘 [N번째]"
  // 예: 1번째 = "하나 둘 하나", 2번째 = "하나 둘 둘", ...
  Speech.stop();
  Speech.speak(`하나 둘 ${word}`, {
    language: 'ko-KR',
    pitch: 1.1,
    rate: 1.2,
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

  // 세션 (시간 기반).
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [remainingSec, setRemainingSec] = useState(0);
  const [endReason, setEndReason] = useState<'time' | 'gap' | null>(null);
  const lastRepTimeRef = useRef<number>(0);
  // 음성 announce 시 stale closure 회피용.
  const squatCountRef = useRef(0);
  useEffect(() => {
    squatCountRef.current = squatCount;
  }, [squatCount]);

  // T자세 hold 진행도 (0~1).
  const [tPoseHoldProgress, setTPoseHoldProgress] = useState(0);
  const tPoseStartRef = useRef<number | null>(null);
  // 음성 안내 중복 방지.
  const lastVoicedDistanceOkRef = useRef<boolean | null>(null);

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

  // 스쿼트 state machine. 거리 적절 + 세션 active 일 때만 카운트.
  useEffect(() => {
    if (mode !== 'squat' || !squatGeometry || thresholdY === null) return;
    if (distanceStatus !== 'ok') return; // 멀거나 가까우면 카운트 X
    if (sessionState !== 'active') return; // 세션 active 일 때만 카운트

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
  }, [squatGeometry, thresholdY, mode, distanceStatus, sessionState]);

  // 모드 변경 시 카운트 + threshold + 세션 리셋.
  useEffect(() => {
    if (mode === 'squat') {
      setSquatCount(0);
      setSquatState('WAITING');
      setThresholdY(null);
      setSessionState('idle');
      setRemainingSec(0);
      setTPoseHoldProgress(0);
      tPoseStartRef.current = null;
      lastVoicedDistanceOkRef.current = null;
      downEnteredAtRef.current = 0;
      speakMessage('거리를 맞추고 양팔을 벌려 티 자세로 대기해주세요');
    } else {
      Speech.stop();
      setSessionState('idle');
    }
  }, [mode]);

  // 카운트 변경 시 음성. 0 → 1 부터 발화.
  useEffect(() => {
    if (mode !== 'squat' || squatCount === 0) return;
    if (sessionState !== 'active') return;
    speakCount(squatCount);
  }, [squatCount, mode, sessionState]);

  // 세션 시작 (idle → countdown → active → complete).
  const startSession = useCallback(() => {
    Speech.stop();
    setSquatCount(0);
    setSquatState('WAITING');
    downEnteredAtRef.current = 0;
    setRemainingSec(PRE_COUNTDOWN_SEC);
    setSessionState('countdown');
    setEndReason(null);
    setTPoseHoldProgress(0);
    tPoseStartRef.current = null;
    lastRepTimeRef.current = 0;
  }, []);

  // T자세 감지 — 양 손목/팔꿈치 어깨 높이 + 어깨 밖 펼침.
  const isTPose = useMemo(() => {
    if (!pose || !isPersonDetected) return false;
    const ls = pose.landmarks[11];
    const rs = pose.landmarks[12];
    const le = pose.landmarks[13];
    const re = pose.landmarks[14];
    const lw = pose.landmarks[15];
    const rw = pose.landmarks[16];
    if (!ls || !rs || !le || !re || !lw || !rw) return false;
    if (
      lw.inFrameLikelihood < 0.4 ||
      rw.inFrameLikelihood < 0.4 ||
      le.inFrameLikelihood < 0.4 ||
      re.inFrameLikelihood < 0.4
    ) {
      return false;
    }
    const shoulderY = (ls.y + rs.y) / 2;
    const yTol = pose.frameHeight * T_POSE_Y_TOLERANCE_RATIO;
    const wristAtShoulder =
      Math.abs(lw.y - shoulderY) < yTol &&
      Math.abs(rw.y - shoulderY) < yTol;
    const elbowAtShoulder =
      Math.abs(le.y - shoulderY) < yTol &&
      Math.abs(re.y - shoulderY) < yTol;
    // 손목이 어깨 바깥으로 펼침 (좌측 손목 < 좌어깨 x, 우측 손목 > 우어깨 x).
    const armsExtended = lw.x < ls.x && rw.x > rs.x;
    return wristAtShoulder && elbowAtShoulder && armsExtended;
  }, [pose, isPersonDetected]);

  // idle 상태에서 거리 변경 시 음성 안내 (전환 시점에 1번).
  useEffect(() => {
    if (mode !== 'squat' || sessionState !== 'idle') {
      lastVoicedDistanceOkRef.current = null;
      return;
    }
    const isOk = distanceStatus === 'ok';
    if (lastVoicedDistanceOkRef.current === isOk) return;
    if (isOk) {
      speakMessage('양팔을 벌려 티 자세로 대기해주세요');
    } else if (distanceStatus !== 'no_pose') {
      speakMessage('거리를 맞춰주세요');
    }
    lastVoicedDistanceOkRef.current = isOk;
  }, [distanceStatus, mode, sessionState]);

  // T자세 hold tracking (idle + ok + isTPose 일 때 1.5초 누적 → startSession).
  useEffect(() => {
    if (mode !== 'squat' || sessionState !== 'idle') {
      setTPoseHoldProgress(0);
      tPoseStartRef.current = null;
      return;
    }
    if (distanceStatus !== 'ok' || !isTPose) {
      setTPoseHoldProgress(0);
      tPoseStartRef.current = null;
      return;
    }
    if (tPoseStartRef.current === null) {
      tPoseStartRef.current = Date.now();
    }
    const interval = setInterval(() => {
      if (tPoseStartRef.current === null) return;
      const elapsed = Date.now() - tPoseStartRef.current;
      const progress = Math.min(elapsed / T_POSE_HOLD_MS, 1);
      setTPoseHoldProgress(progress);
      if (progress >= 1) {
        clearInterval(interval);
        startSession();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isTPose, distanceStatus, mode, sessionState, startSession]);

  // 1초 tick — countdown / active 동안 매 초 remainingSec 감소.
  useEffect(() => {
    if (sessionState !== 'countdown' && sessionState !== 'active') return;
    const interval = setInterval(() => {
      setRemainingSec((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionState]);

  // remainingSec 변화에 따른 음성 + 상태 전환.
  useEffect(() => {
    if (sessionState === 'countdown') {
      if (remainingSec === 0) {
        speakMessage('시작');
        setRemainingSec(ACTIVE_SESSION_SEC);
        setSessionState('active');
      } else {
        // 5,4,3,2,1
        Speech.stop();
        Speech.speak(String(remainingSec), {
          language: 'ko-KR',
          pitch: 1.2,
          rate: 1.2,
        });
      }
    } else if (sessionState === 'active') {
      if (remainingSec === 0) {
        Speech.stop();
        Speech.speak(`30초 동안 ${squatCountRef.current}개 했어요`, {
          language: 'ko-KR',
          pitch: 1.0,
          rate: 1.0,
        });
        setEndReason('time');
        setSessionState('complete');
      } else if (remainingSec <= FINAL_COUNTDOWN_VOICE_SEC && remainingSec > 0) {
        Speech.stop();
        Speech.speak(String(remainingSec), {
          language: 'ko-KR',
          pitch: 1.3,
          rate: 1.2,
        });
      }
    }
  }, [remainingSec, sessionState]);

  // active 진입 시 lastRepTime 초기화.
  useEffect(() => {
    if (sessionState === 'active') {
      lastRepTimeRef.current = Date.now();
    }
  }, [sessionState]);

  // 새 rep 카운트 시 lastRepTime 갱신.
  useEffect(() => {
    if (sessionState !== 'active' || squatCount === 0) return;
    lastRepTimeRef.current = Date.now();
  }, [squatCount, sessionState]);

  // Rep gap 타임아웃 감시 — 4초 이상 rep 없으면 "중단".
  useEffect(() => {
    if (sessionState !== 'active') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastRepTimeRef.current;
      if (elapsed > REP_GAP_TIMEOUT_MS) {
        Speech.stop();
        Speech.speak(
          `중단됐어요. ${squatCountRef.current}개 했어요`,
          { language: 'ko-KR', pitch: 1.0, rate: 1.0 },
        );
        setEndReason('gap');
        setSessionState('complete');
      }
    }, 500);
    return () => clearInterval(interval);
  }, [sessionState]);

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

      {/* 스쿼트 카운트 (큰 숫자) + 타이머 */}
      {mode === 'squat' && (
        <View style={styles.squatPanel}>
          <Text style={styles.squatLabel}>스쿼트</Text>
          <Text style={styles.squatCount}>{squatCount}</Text>
          {sessionState === 'active' && (
            <Text style={styles.squatTimer}>
              {remainingSec}초
            </Text>
          )}
          <Text
            style={[
              styles.squatState,
              squatState === 'DOWN' && distanceStatus === 'ok' && sessionState === 'active' && styles.squatStateDown,
              (distanceStatus !== 'ok' || sessionState !== 'active') && styles.squatStateGated,
            ]}
          >
            {sessionState === 'idle' ? '시작 버튼 누르기' :
             sessionState === 'countdown' ? '준비 중...' :
             sessionState === 'complete' ? '완료!' :
             distanceStatus !== 'ok' ? '거리 조정 필요 ⚠' :
             squatState === 'WAITING' ? '시작 자세 대기' :
             squatState === 'UP' ? '서있음 (UP)' :
             '앉음 (DOWN)'}
          </Text>
        </View>
      )}

      {/* 사전 카운트다운 (큰 중앙 숫자) */}
      {mode === 'squat' && sessionState === 'countdown' && remainingSec > 0 && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <Text style={styles.bigCountdown}>{remainingSec}</Text>
          <Text style={styles.bigCountdownLabel}>준비</Text>
        </View>
      )}

      {/* 세션 완료 결과 화면 */}
      {mode === 'squat' && sessionState === 'complete' && (
        <View style={styles.completeOverlay}>
          <Text style={styles.completeTitle}>
            {endReason === 'gap' ? '중단됨' : '30초 완료'}
          </Text>
          <Text style={styles.completeCount}>{squatCount}</Text>
          <Text style={styles.completeUnit}>개</Text>
          <Pressable
            style={styles.completeButton}
            onPress={() => {
              setSessionState('idle');
              setEndReason(null);
              setSquatCount(0);
              lastVoicedDistanceOkRef.current = null;
              speakMessage('양팔을 벌려 티 자세로 대기해주세요');
            }}
          >
            <Text style={styles.completeButtonText}>다시</Text>
          </Pressable>
        </View>
      )}

      {/* idle 상태 안내 + T자세 hold 진행도 */}
      {mode === 'squat' && sessionState === 'idle' && (
        <View style={styles.idleOverlay} pointerEvents="none">
          <Text style={styles.idleMessage}>
            {distanceStatus !== 'ok' ? '거리를 맞춰주세요' :
             !isTPose ? '양팔을 벌려 T 자세로 대기' :
             '잠시만 유지...'}
          </Text>
          {tPoseHoldProgress > 0 && (
            <View style={styles.holdBarOuter}>
              <View
                style={[
                  styles.holdBarInner,
                  { width: `${tPoseHoldProgress * 100}%` },
                ]}
              />
            </View>
          )}
        </View>
      )}

      <View style={styles.controlsBar}>
        {/* 운동 모드 토글 + 카메라 (countdown/active 중에는 숨김) */}
        {(sessionState === 'idle' || sessionState === 'complete') && (
          <>
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
          </>
        )}
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
  squatStateGated: {
    color: '#FF6464',
  },
  squatTimer: {
    color: '#FFA500',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  // idle 안내 (T자세 트리거 대기)
  idleOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  idleMessage: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 16,
  },
  holdBarOuter: {
    width: 220,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  holdBarInner: {
    height: '100%',
    backgroundColor: '#00C853',
  },
  // 사전 카운트다운 (중앙 큰 숫자)
  centerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCountdown: {
    color: '#fff',
    fontSize: 200,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  bigCountdownLabel: {
    color: '#FFA500',
    fontSize: 28,
    fontWeight: '700',
    marginTop: -20,
  },
  // 완료 결과 화면
  completeOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  completeTitle: {
    color: '#FFA500',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
  },
  completeCount: {
    color: '#fff',
    fontSize: 140,
    fontWeight: '900',
    lineHeight: 150,
  },
  completeUnit: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
    marginTop: -10,
    marginBottom: 32,
  },
  completeButton: {
    backgroundColor: '#FFA500',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 32,
  },
  completeButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
});
