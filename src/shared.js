export const STORM_PERIOD = 36

export const STRIKES = [
  { t: 1.4, meters: 520 },
  { t: 7.2, meters: 1280 },
  { t: 7.7, meters: 340 },
  { t: 15.1, meters: 1700 },
  { t: 22.0, meters: 240 },
  { t: 22.45, meters: 860 },
  { t: 30.2, meters: 980 },
]

export function eruptionEnergy(time) {
  const x = (time % 11) / 11
  const base = 0.38 + 0.12 * Math.sin(time * 0.65)
  if (x < 0.62) return base
  const k = (x - 0.62) / 0.38
  return base + Math.exp(-k * 3.4)
}

export function lightningFlash(time) {
  const local = time % STORM_PERIOD
  let flash = 0
  for (const s of STRIKES) {
    const dt = local - s.t
    if (dt >= 0 && dt < 1.15) {
      const env = Math.exp(-dt * 7.5) * 1.15 + Math.exp(-dt * 1.5) * 0.4
      if (env > flash) flash = env
    }
  }
  return Math.min(flash, 1.35)
}

export function activeStrike(time) {
  const local = time % STORM_PERIOD
  let best = -1
  let bestEnv = 0
  for (let i = 0; i < STRIKES.length; i++) {
    const dt = local - STRIKES[i].t
    if (dt >= 0 && dt < 0.42) {
      const env = Math.exp(-dt * 12)
      if (env > bestEnv) {
        bestEnv = env
        best = i
      }
    }
  }
  return best
}
