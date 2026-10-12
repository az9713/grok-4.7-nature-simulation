export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1e-6)))
  return t * t * (3 - 2 * t)
}

export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function vnoise(x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

export function fbm(x, y) {
  let v = 0
  let a = 0.5
  let f = 1
  let px = x
  let py = y
  for (let i = 0; i < 5; i++) {
    v += a * vnoise(px, py)
    const nx = px * 0.8 - py * 0.6
    const ny = px * 0.6 + py * 0.8
    px = nx * 2.02
    py = ny * 2.02
    f *= 2.02
    a *= 0.5
  }
  return v
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function peakShape(x) {
  let s =
    Math.sin(x * 0.16) * 0.55 +
    Math.sin(x * 0.047 + 1.4) * 0.7 +
    Math.sin(x * 0.41 + 0.6) * 0.22
  s = Math.max(s, 0)
  return s * s * 4.2
}
