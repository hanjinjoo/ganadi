/**
 * Stage 1: backwards-compatible clock extension for the existing v2 save payload.
 *
 * Do not bump save.version here: older published v2 builds must still be able to
 * load the same world if the stage-1 deployment is rolled back. Future gameplay
 * state (radiation, equipment, milking) will require a separate reviewed schema
 * migration once those systems actually exist.
 */
export const ACTIVE_GENERATION_VERSION = 6;
export const RESERVED_TERRAIN_GENERATION_VERSION = 4;
export const DAY_SECONDS = 600;

const inRange = value => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

export function readClockMeta(meta) {
  if (!meta || !inRange(meta.playTime)) {
    throw new Error('저장 meta.playTime 오류');
  }
  const hasTrackedClock = meta.worldElapsedSeconds !== undefined;
  const worldElapsedSeconds = hasTrackedClock ? meta.worldElapsedSeconds : meta.playTime;
  const clockSource = meta.clockSource ?? (hasTrackedClock ? 'tracked' : 'legacy-estimate');
  if (!inRange(worldElapsedSeconds) || worldElapsedSeconds + 0.0001 < meta.playTime) {
    throw new Error('저장 meta.worldElapsedSeconds 오류');
  }
  if (!['tracked', 'legacy-estimate'].includes(clockSource)) {
    throw new Error('저장 meta.clockSource 오류');
  }
  const generation = meta.generationVersion ?? 1;
  if (!Number.isInteger(generation) || generation < 1 || generation > ACTIVE_GENERATION_VERSION) {
    throw new Error('저장 meta.generationVersion 오류: 지원되지 않는 월드 생성 버전');
  }
  return { worldElapsedSeconds, clockSource, generationVersion: generation };
}

export function advanceClockThroughSleep(worldElapsedSeconds, dayTimeSeconds, daySeconds = DAY_SECONDS) {
  if (!inRange(worldElapsedSeconds) || !inRange(dayTimeSeconds)
    || !inRange(daySeconds) || daySeconds <= 0 || dayTimeSeconds >= daySeconds) {
    throw new Error('게임 시간 계산 오류');
  }
  // Sleeping advances the world clock to the next morning without applying
  // any gameplay damage for the skipped period.
  return worldElapsedSeconds + daySeconds - dayTimeSeconds;
}
