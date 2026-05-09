import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import { useAudioPlayer } from 'expo-audio';
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

type ExerciseMode = 'view' | 'squat' | 'jumping_jack';

// 운동별 메타: 표시 이름 + 시작 자세 분류 + atTop 의미.
//   startingAtTop: 시작 자세가 '운동 정점' 이면 true (스쿼트 = 서있음 = 정점).
//                  점프잭 = 차렷 = 정점 X (= 바닥). startingAtTop=false.
const EXERCISE_META: Record<Exclude<ExerciseMode, 'view'>, {
  label: string;
  startingAtTop: boolean;
  readyPoseInstruction: string;
}> = {
  squat: {
    label: '스쿼트',
    startingAtTop: true,
    readyPoseInstruction: '양손을 모아 대기',
  },
  jumping_jack: {
    label: '점프잭',
    startingAtTop: false,
    readyPoseInstruction: '차렷 자세로 대기',
  },
};

type SquatState = 'WAITING' | 'UP' | 'DOWN';

type SessionState = 'idle' | 'intro' | 'active' | 'complete';

// 신호음에서 연속 탈락 한도. 이 횟수 이상 → 스탑.
const MAX_CONSECUTIVE_MISSES = 3;

// 시작 자세 = 운동별 다름 (현재 스쿼트만 = 기도손, 양손 모음).
// 양 손목 거리 < frameW * 임계 + 가슴~hip 영역 + 1.5초 유지.
const READY_POSE_HOLD_MS = 1500;
const PRAYER_WRIST_DISTANCE_RATIO = 0.10; // 양 손목 거리 < 10% frameW
const PRAYER_HAND_HALO_RADIUS = 32;        // 손목 시각 원 반경 (px)
const PRAYER_MERGE_DISTANCE_RATIO = 0.12;  // 시각 원 합쳐지는 임계

// 메트로놈 비트 간격 (1초). cycle = 3 비트 = 3초/rep.
//   beat 0: 비프 (내려감)
//   beat 1: 비프 (올라옴)
//   beat 2: 음성 count (rep 완료) 또는 "아웃"
const CADENCE_BEAT_MS = 1000;

// minRepDuration (가짜 rep 차단). 운동 동일 (실측 후 운동별 분리 가능).
const SQUAT_MIN_REP_DURATION_MS = 300;

// 임계점 EMA — 서있을 때 천천히 적응 (사용자 카메라 거리 변화 흡수).
const THRESHOLD_EMA_ALPHA = 0.05;

// 한국어 자연수 (1~99). 100+ 는 자릿수 그대로 ("백" 어색).
const KOREAN_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const KOREAN_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function koreanCountWord(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  if (n >= 100) return String(n); // 100+ 자릿수 ("백 일" 어색)
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (tens === 0) return KOREAN_ONES[ones];
  if (ones === 0) return KOREAN_TENS[tens];
  return `${KOREAN_TENS[tens]}${KOREAN_ONES[ones]}`;
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

  // 비프 사운드 (메트로놈 비트). 150ms 1kHz.
  const beepPlayer = useAudioPlayer(require('../../assets/sounds/beep.wav'));
  const playBeep = useCallback(() => {
    beepPlayer.seekTo(0);
    beepPlayer.play();
  }, [beepPlayer]);

  // 스쿼트 state machine (ref 로 관리해서 closure stale 회피).
  const [squatCount, setSquatCount] = useState(0);
  const [squatState, setSquatState] = useState<SquatState>('WAITING');
  const [thresholdY, setThresholdY] = useState<number | null>(null);
  const downEnteredAtRef = useRef<number>(0);

  // 세션.
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [endReason, setEndReason] = useState<'out' | null>(null);
  const [missStreak, setMissStreak] = useState(0);
  // 놓침 경고 배너 (시각). key 증가시키면 자동 hide 타이머 재시작.
  const [missWarning, setMissWarning] = useState<{ visible: boolean; key: number }>(
    { visible: false, key: 0 },
  );
  // 음성 announce 시 stale closure 회피용.
  const squatCountRef = useRef(0);
  useEffect(() => {
    squatCountRef.current = squatCount;
  }, [squatCount]);

  // 시작 자세 hold 진행도 (0~1, 운동별 다름 — 스쿼트 = 기도손).
  const [readyPoseHoldProgress, setReadyPoseHoldProgress] = useState(0);
  const readyPoseStartRef = useRef<number | null>(null);

  // 총 경과 시간 (active 동안).
  const [activeElapsedMs, setActiveElapsedMs] = useState(0);
  const activeStartTimeRef = useRef<number | null>(null);
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
    if (mode !== 'squat') return null;
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
  }, [pose, isPersonDetected, mode]);

  // atTop = "운동 정점 자세" 검출.
  //   스쿼트: hip y < threshold (= 서있음)
  //   점프잭: 양 손목 모임 + 머리 위 (= 만세 + 박수)
  const atTop = useMemo<boolean | null>(() => {
    if (!pose || !isPersonDetected) return null;
    if (mode === 'squat') {
      if (!squatGeometry || thresholdY === null) return null;
      return squatGeometry.hipY < thresholdY;
    }
    if (mode === 'jumping_jack') {
      const lw = pose.landmarks[15];
      const rw = pose.landmarks[16];
      const nose = pose.landmarks[0];
      if (!lw || !rw || !nose) return null;
      if (
        lw.inFrameLikelihood < 0.4 ||
        rw.inFrameLikelihood < 0.4 ||
        nose.inFrameLikelihood < 0.4
      ) {
        return null;
      }
      const wristDist = Math.hypot(lw.x - rw.x, lw.y - rw.y);
      const wristsTogether = wristDist < pose.frameWidth * 0.18;
      const wristAvgY = (lw.y + rw.y) / 2;
      const aboveHead = wristAvgY < nose.y;
      return wristsTogether && aboveHead;
    }
    return null;
  }, [pose, isPersonDetected, mode, squatGeometry, thresholdY]);

  // 임계 y 설정 — (hip+knee) / 2 중간점.
  // - WAITING: 즉시 추적 (사용자 자세 변동 그대로 반영, 첫 squat 전이라 lock 불필요)
  // - UP: 천천히 EMA (squat 사이 거리 변화 흡수, 떨림 차단)
  // - DOWN: 잠금 (squat 중 임계가 따라 내려가면 카운트 안 됨)
  useEffect(() => {
    if (mode !== 'squat' || !squatGeometry) return;
    setThresholdY((prev) => {
      const currentMid = (squatGeometry.hipY + squatGeometry.kneeY) / 2;
      if (prev === null) return currentMid;
      if (squatState === 'WAITING') return currentMid;
      if (squatState === 'UP') {
        return THRESHOLD_EMA_ALPHA * currentMid + (1 - THRESHOLD_EMA_ALPHA) * prev;
      }
      return prev; // DOWN: 잠금
    });
  }, [squatGeometry, squatState, mode]);

  // 운동 generic state machine. atTop = 정점 (UP), !atTop = 바닥 (DOWN).
  // 카운트는 startingAtTop 으로 돌아올 때 +1 (= 1 cycle 완성).
  //   스쿼트: startingAtTop=true (서서 시작) → UP→DOWN→UP 가 1 rep
  //   점프잭: startingAtTop=false (차렷 시작) → DOWN→UP→DOWN 가 1 rep
  useEffect(() => {
    if (mode === 'view' || atTop === null) return;
    if (distanceStatus !== 'ok') return;
    if (sessionState !== 'active') return;

    const meta = EXERCISE_META[mode];
    const startingState: SquatState = meta.startingAtTop ? 'UP' : 'DOWN';
    const oppositeState: SquatState = meta.startingAtTop ? 'DOWN' : 'UP';
    const atStarting = meta.startingAtTop ? atTop : !atTop;
    const now = Date.now();

    setSquatState((prev) => {
      if (prev === 'WAITING' && atStarting) return startingState;
      if (prev === startingState && !atStarting) {
        downEnteredAtRef.current = now;
        return oppositeState;
      }
      if (prev === oppositeState && atStarting) {
        const repDurationMs = now - downEnteredAtRef.current;
        if (repDurationMs >= SQUAT_MIN_REP_DURATION_MS) {
          setSquatCount((c) => c + 1);
        }
        return startingState;
      }
      return prev;
    });
  }, [atTop, mode, distanceStatus, sessionState]);

  // 모드 변경 시 리셋.
  useEffect(() => {
    if (mode !== 'view') {
      setSquatCount(0);
      setSquatState('WAITING');
      setThresholdY(null);
      setSessionState('idle');
      setMissStreak(0);
      setReadyPoseHoldProgress(0);
      readyPoseStartRef.current = null;
      lastVoicedDistanceOkRef.current = null;
      downEnteredAtRef.current = 0;
      const meta = EXERCISE_META[mode];
      speakMessage(`거리를 맞추고 ${meta.readyPoseInstruction}해주세요`);
    } else {
      Speech.stop();
      setSessionState('idle');
    }
  }, [mode]);

  // 메트로놈 cadence (3-비트 cycle, 1초 간격, 3초/rep).
  // Cycle:
  //   Beat 0 (down): 삑 (비프) → 사용자 내려감
  //   Beat 1 (up):   삑 (비프) → 사용자 올라옴
  //   Beat 2 (count): rep 했으면 "[N번째]", 못했으면 "놓침"
  // 연속 3회 놓침 → "스탑" + 종료.
  useEffect(() => {
    if (mode !== 'squat' || sessionState !== 'active') return;

    let beat: 'down' | 'up' | 'count' = 'down';
    let cycleStartCount = squatCountRef.current;
    let expectedRepNum = 1;
    let missStreakLocal = 0;

    playBeep();
    beat = 'up';

    const interval = setInterval(() => {
      if (beat === 'up') {
        playBeep();
        beat = 'count';
      } else if (beat === 'count') {
        const didRep = squatCountRef.current > cycleStartCount;
        if (didRep) {
          Speech.stop();
          Speech.speak(koreanCountWord(expectedRepNum), {
            language: 'ko-KR',
            pitch: 1.2,
            rate: 1.1,
          });
          expectedRepNum += 1;
          cycleStartCount = squatCountRef.current;
          missStreakLocal = 0;
          setMissStreak(0);
          beat = 'down';
        } else {
          missStreakLocal += 1;
          setMissStreak(missStreakLocal);
          if (missStreakLocal >= MAX_CONSECUTIVE_MISSES) {
            Speech.stop();
            Speech.speak('스탑', {
              language: 'ko-KR',
              pitch: 1.0,
              rate: 1.0,
            });
            setEndReason('out');
            setSessionState('complete');
            clearInterval(interval);
          } else {
            // 짧게 — count 자리 1초 안에 끝나서 다음 비프와 안 겹침.
            const message = missStreakLocal === 1 ? '맞춰주세요' : '마지막';
            Speech.stop();
            Speech.speak(message, {
              language: 'ko-KR',
              pitch: 1.1,
              rate: 1.2,
            });
            setMissWarning((prev) => ({ visible: true, key: prev.key + 1 }));
            cycleStartCount = squatCountRef.current;
            beat = 'down';
          }
        }
      } else if (beat === 'down') {
        playBeep();
        beat = 'up';
      }
    }, CADENCE_BEAT_MS);

    return () => clearInterval(interval);
  }, [mode, sessionState, playBeep]);

  // 세션 시작 (idle → intro → active → complete).
  // 인트로: "지금부터 신호에 맞춰 운동을 시작하겠습니다" → 잠시 → "셋" → "둘" → "하나" → active.
  const startSession = useCallback(() => {
    Speech.stop();
    setSquatCount(0);
    setSquatState('WAITING');
    setThresholdY(null);
    downEnteredAtRef.current = 0;
    setSessionState('intro');
    setEndReason(null);
    setMissStreak(0);
    setReadyPoseHoldProgress(0);
    readyPoseStartRef.current = null;

    const announceOpts = { language: 'ko-KR', pitch: 1.0, rate: 1.0 } as const;
    const numberOpts = { language: 'ko-KR', pitch: 1.2, rate: 1.0 } as const;

    const exerciseLabel = mode !== 'view' ? EXERCISE_META[mode].label : '운동';
    Speech.speak(`지금부터 신호에 맞춰 ${exerciseLabel}를 시작하겠습니다.`, {
      ...announceOpts,
      onDone: () => {
        setTimeout(() => {
          Speech.speak('셋', numberOpts);
          setTimeout(() => {
            Speech.speak('둘', numberOpts);
            setTimeout(() => {
              Speech.speak('하나', numberOpts);
              setTimeout(() => {
                setSessionState('active');
              }, 1000);
            }, 1000);
          }, 1000);
        }, 500);
      },
    });
  }, []);

  // 시작 자세 — 운동별 다름.
  //   스쿼트: 기도손 (양 손목 모임, 가슴~hip 영역)
  //   점프잭: 차렷 (양 손목이 어깨 아래 + hip 옆 옆구리)
  const isReadyPose = useMemo(() => {
    if (!pose || !isPersonDetected) return false;
    const ls = pose.landmarks[11];
    const rs = pose.landmarks[12];
    const lh = pose.landmarks[23];
    const rh = pose.landmarks[24];
    const lw = pose.landmarks[15];
    const rw = pose.landmarks[16];
    if (!ls || !rs || !lh || !rh || !lw || !rw) return false;
    if (lw.inFrameLikelihood < 0.4 || rw.inFrameLikelihood < 0.4) return false;

    const shoulderY = (ls.y + rs.y) / 2;
    const hipY = (lh.y + rh.y) / 2;

    if (mode === 'squat') {
      // 기도손: 양 손목 거리 작음 + 가슴~hip 영역
      const wristDist = Math.hypot(lw.x - rw.x, lw.y - rw.y);
      const wristsTogether = wristDist < pose.frameWidth * PRAYER_WRIST_DISTANCE_RATIO;
      const wristAvgY = (lw.y + rw.y) / 2;
      const wristsAtChest = wristAvgY > shoulderY && wristAvgY < hipY;
      return wristsTogether && wristsAtChest;
    }

    if (mode === 'jumping_jack') {
      // 차렷: 양 손목이 어깨 아래 + hip 옆 옆구리
      const yTol = pose.frameHeight * 0.20;
      const xTol = pose.frameWidth * 0.18;
      const wristsLowered = lw.y > shoulderY && rw.y > shoulderY;
      const lwNearHipY = Math.abs(lw.y - hipY) < yTol;
      const rwNearHipY = Math.abs(rw.y - hipY) < yTol;
      const lwNearHipX = Math.abs(lw.x - lh.x) < xTol;
      const rwNearHipX = Math.abs(rw.x - rh.x) < xTol;
      return wristsLowered && lwNearHipY && rwNearHipY && lwNearHipX && rwNearHipX;
    }

    return false;
  }, [pose, isPersonDetected, mode]);

  // idle 상태에서 거리 변경 시 음성 안내 (전환 시점에 1번).
  useEffect(() => {
    if (mode !== 'squat' || sessionState !== 'idle') {
      lastVoicedDistanceOkRef.current = null;
      return;
    }
    const isOk = distanceStatus === 'ok';
    if (lastVoicedDistanceOkRef.current === isOk) return;
    if (isOk) {
      speakMessage(mode !== 'view' ? `${EXERCISE_META[mode].readyPoseInstruction}해주세요` : '대기해주세요');
    } else if (distanceStatus !== 'no_pose') {
      speakMessage('거리를 맞춰주세요');
    }
    lastVoicedDistanceOkRef.current = isOk;
  }, [distanceStatus, mode, sessionState]);

  // 시작 자세 hold tracking (idle + ok + isReadyPose 일 때 1.5초 누적 → startSession).
  useEffect(() => {
    if (mode !== 'squat' || sessionState !== 'idle') {
      setReadyPoseHoldProgress(0);
      readyPoseStartRef.current = null;
      return;
    }
    if (distanceStatus !== 'ok' || !isReadyPose) {
      setReadyPoseHoldProgress(0);
      readyPoseStartRef.current = null;
      return;
    }
    if (readyPoseStartRef.current === null) {
      readyPoseStartRef.current = Date.now();
    }
    const interval = setInterval(() => {
      if (readyPoseStartRef.current === null) return;
      const elapsed = Date.now() - readyPoseStartRef.current;
      const progress = Math.min(elapsed / READY_POSE_HOLD_MS, 1);
      setReadyPoseHoldProgress(progress);
      if (progress >= 1) {
        clearInterval(interval);
        startSession();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isReadyPose, distanceStatus, mode, sessionState, startSession]);

  // 30초 시간 제한 제거 — 신호음에 맞춰 무한 (3연속 탈락까지 진행).

  // 총 경과 시간 (active 동안). 100ms 마다 업데이트.
  useEffect(() => {
    if (sessionState !== 'active') {
      activeStartTimeRef.current = null;
      return;
    }
    activeStartTimeRef.current = Date.now();
    setActiveElapsedMs(0);
    const interval = setInterval(() => {
      if (activeStartTimeRef.current) {
        setActiveElapsedMs(Date.now() - activeStartTimeRef.current);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [sessionState]);

  // 놓침 경고 배너 자동 hide (1.5초).
  useEffect(() => {
    if (!missWarning.visible) return;
    const t = setTimeout(() => {
      setMissWarning((prev) => (prev.key === missWarning.key ? { ...prev, visible: false } : prev));
    }, 1500);
    return () => clearTimeout(t);
  }, [missWarning.key, missWarning.visible]);


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
          {/* 시작 자세 시각 — 양 손목에 원 (스쿼트 idle 상태에서만) */}
          {mode === 'squat' && sessionState === 'idle' && distanceStatus === 'ok' && (() => {
            const lw = pose.landmarks[15];
            const rw = pose.landmarks[16];
            if (!lw || !rw) return null;
            if (lw.inFrameLikelihood < 0.3 || rw.inFrameLikelihood < 0.3) return null;
            const lp = transformLandmark(lw, pose.frameWidth, pose.frameHeight);
            const rp = transformLandmark(rw, pose.frameWidth, pose.frameHeight);
            const merged = isReadyPose;
            const color = merged ? '#FFD700' : '#FFA500';
            const opacity = merged ? 0.85 : 0.55;
            return (
              <>
                <Circle
                  key="prayer-l"
                  cx={lp.x}
                  cy={lp.y}
                  r={PRAYER_HAND_HALO_RADIUS}
                  color={color}
                  opacity={opacity}
                />
                <Circle
                  key="prayer-r"
                  cx={rp.x}
                  cy={rp.y}
                  r={PRAYER_HAND_HALO_RADIUS}
                  color={color}
                  opacity={opacity}
                />
                <Line
                  key="prayer-link"
                  p1={vec(lp.x, lp.y)}
                  p2={vec(rp.x, rp.y)}
                  color={color}
                  strokeWidth={merged ? 4 : 2}
                  opacity={opacity}
                />
              </>
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

      {/* 운동 카운트 (큰 숫자) + 경과 시간 + 놓침 카운터 */}
      {mode !== 'view' && (
        <View style={styles.squatPanel}>
          <Text style={styles.squatLabel}>{EXERCISE_META[mode].label}</Text>
          <Text style={styles.squatCount}>{squatCount}</Text>
          {sessionState === 'active' && (
            <Text style={styles.squatTime}>
              {formatElapsed(activeElapsedMs)}
            </Text>
          )}
          {sessionState === 'active' && missStreak > 0 && (
            <Text style={styles.squatMiss}>
              놓침 {missStreak} / {MAX_CONSECUTIVE_MISSES}
            </Text>
          )}
          <Text
            style={[
              styles.squatState,
              squatState === 'DOWN' && distanceStatus === 'ok' && sessionState === 'active' && styles.squatStateDown,
              (distanceStatus !== 'ok' || sessionState !== 'active') && styles.squatStateGated,
            ]}
          >
            {sessionState === 'idle' ? '양손 모음 대기' :
             sessionState === 'intro' ? '시작 안내 중...' :
             sessionState === 'complete' ? '완료!' :
             distanceStatus !== 'ok' ? '거리 조정 필요 ⚠' :
             squatState === 'WAITING' ? '시작 자세 대기' :
             squatState === 'UP' ? '서있음 (UP)' :
             '앉음 (DOWN)'}
          </Text>
        </View>
      )}

      {/* 놓침 경고 배너 (1.5초 자동 hide) */}
      {mode !== 'view' && sessionState === 'active' && missWarning.visible && (
        <View style={styles.missWarningBanner} pointerEvents="none">
          <Text style={styles.missWarningText}>
            {missStreak >= 2 ? '⚠ 마지막 — 다음 놓침 시 종료' : '⚠ 박자에 맞춰주세요'}
          </Text>
        </View>
      )}

      {/* 인트로 — 음성 안내 중 시각 메시지 */}
      {mode !== 'view' && sessionState === 'intro' && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <Text style={styles.introMessage}>준비</Text>
          <Text style={styles.introSubMessage}>곧 시작합니다</Text>
        </View>
      )}

      {/* 세션 완료 결과 화면 */}
      {mode !== 'view' && sessionState === 'complete' && (
        <View style={styles.completeOverlay}>
          <Text style={styles.completeTitle}>
            {endReason === 'out' ? '스탑' : '완료'}
          </Text>
          <Text style={styles.completeCount}>{squatCount}</Text>
          <Text style={styles.completeUnit}>개</Text>
          <Pressable
            style={styles.completeButton}
            onPress={() => {
              setSessionState('idle');
              setEndReason(null);
              setSquatCount(0);
              setSquatState('WAITING');
              setThresholdY(null);
              downEnteredAtRef.current = 0;
              lastVoicedDistanceOkRef.current = null;
              speakMessage(mode !== 'view' ? `${EXERCISE_META[mode].readyPoseInstruction}해주세요` : '대기해주세요');
            }}
          >
            <Text style={styles.completeButtonText}>다시</Text>
          </Pressable>
        </View>
      )}

      {/* idle 상태 안내 + 시작 자세 hold 진행도 */}
      {mode !== 'view' && sessionState === 'idle' && (
        <View style={styles.idleOverlay} pointerEvents="none">
          <Text style={styles.idleMessage}>
            {distanceStatus !== 'ok' ? '거리를 맞춰주세요' :
             !isReadyPose ? EXERCISE_META[mode].readyPoseInstruction :
             '잠시만 유지...'}
          </Text>
          {readyPoseHoldProgress > 0 && (
            <View style={styles.holdBarOuter}>
              <View
                style={[
                  styles.holdBarInner,
                  { width: `${readyPoseHoldProgress * 100}%` },
                ]}
              />
            </View>
          )}
        </View>
      )}

      <View style={styles.controlsBar}>
        {/* 운동 모드 토글 + 카메라 (intro/active 중에는 숨김) */}
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
              <Pressable
                onPress={() => setMode('jumping_jack')}
                style={[styles.modeButton, mode === 'jumping_jack' && styles.modeButtonActive]}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === 'jumping_jack' && styles.modeButtonTextActive,
                  ]}
                >
                  점프잭
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
  squatTime: {
    color: '#FFA500',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1,
  },
  squatMiss: {
    color: '#FF6464',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  missWarningBanner: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(220, 53, 69, 0.95)',
    borderRadius: 10,
    alignItems: 'center',
  },
  missWarningText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  // idle 안내 (시작 자세 트리거 대기)
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
  introMessage: {
    color: '#fff',
    fontSize: 80,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  introSubMessage: {
    color: '#FFA500',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
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
