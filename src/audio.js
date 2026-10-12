import { eruptionEnergy } from './shared.js'

function fillNoise(data, kind) {
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    if (kind === 'brown') {
      last = (last + 0.02 * white) / 1.02
      data[i] = last
    } else {
      data[i] = white
    }
  }
  let max = 1e-4
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]))
  const copy = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) copy[i] = (data[i] / max) * 0.9
  const blend = Math.min(6000, Math.floor(data.length / 10))
  for (let i = 0; i < data.length; i++) data[i] = copy[i]
  for (let i = 0; i < blend; i++) {
    const k = i / blend
    const head = copy[i]
    const tail = copy[data.length - blend + i]
    data[i] = head * k + tail * (1 - k)
    data[data.length - blend + i] = tail * k + head * (1 - k)
  }
}

function makeBuffer(ctx, seconds, kind) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  fillNoise(buffer.getChannelData(0), kind)
  return buffer
}

function loop(ctx, buffer, dest, { type, freq, q, gain }) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const amp = ctx.createGain()
  amp.gain.value = gain
  src.connect(filter)
  filter.connect(amp)
  amp.connect(dest)
  src.start()
  return { src, filter, amp }
}

export function createAudio() {
  const api = {
    ctx: null,
    analyser: null,
    timeData: null,
    started: false,
    muted: true,
    pending: 'river',
    buses: {},
    roar: null,
    nextPop: 0,
    nextBubble: 0,
    unlock,
    setScene,
    setMuted,
    strike,
    update,
  }

  function bus(ctx, master) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(master)
    return gain
  }

  function build() {
    const ctx = new AudioContext()
    api.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0
    api.master = master
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 3.5
    comp.attack.value = 0.008
    comp.release.value = 0.22
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.78
    master.connect(comp)
    comp.connect(analyser)
    analyser.connect(ctx.destination)
    api.analyser = analyser
    api.timeData = new Uint8Array(analyser.fftSize)

    const white = makeBuffer(ctx, 4, 'white')
    const brown = makeBuffer(ctx, 4, 'brown')
    api.white = white

    const ids = ['river', 'falls', 'aurora', 'eruption', 'storm']
    for (const id of ids) api.buses[id] = bus(ctx, master)

    loop(ctx, brown, api.buses.river, { type: 'lowpass', freq: 480, q: 0.4, gain: 0.2 })
    loop(ctx, white, api.buses.river, { type: 'bandpass', freq: 1300, q: 0.55, gain: 0.045 })
    loop(ctx, white, api.buses.river, { type: 'highpass', freq: 5200, q: 0.3, gain: 0.012 })

    loop(ctx, brown, api.buses.falls, { type: 'lowpass', freq: 320, q: 0.5, gain: 0.42 })
    loop(ctx, white, api.buses.falls, { type: 'bandpass', freq: 980, q: 0.35, gain: 0.22 })
    loop(ctx, white, api.buses.falls, { type: 'highpass', freq: 3800, q: 0.4, gain: 0.1 })

    const wind = loop(ctx, white, api.buses.aurora, { type: 'bandpass', freq: 640, q: 0.45, gain: 0.05 })
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 220
    lfo.connect(lfoGain)
    lfoGain.connect(wind.filter.frequency)
    lfo.start()
    for (const [freq, gain] of [
      [146.8, 0.01],
      [220.0, 0.007],
      [311.1, 0.004],
    ]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const g = ctx.createGain()
      g.gain.value = gain
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 900
      osc.connect(f)
      f.connect(g)
      g.connect(api.buses.aurora)
      osc.start()
    }

    loop(ctx, brown, api.buses.eruption, { type: 'lowpass', freq: 78, q: 0.7, gain: 0.5 })
    loop(ctx, brown, api.buses.eruption, { type: 'lowpass', freq: 160, q: 0.4, gain: 0.16 })
    api.roar = loop(ctx, white, api.buses.eruption, { type: 'bandpass', freq: 360, q: 0.45, gain: 0.12 })

    const stormWind = loop(ctx, white, api.buses.storm, { type: 'bandpass', freq: 520, q: 0.28, gain: 0.16 })
    const stormLfo = ctx.createOscillator()
    stormLfo.frequency.value = 0.09
    const stormLfoGain = ctx.createGain()
    stormLfoGain.gain.value = 260
    stormLfo.connect(stormLfoGain)
    stormLfoGain.connect(stormWind.filter.frequency)
    stormLfo.start()
    loop(ctx, white, api.buses.storm, { type: 'highpass', freq: 2400, q: 0.4, gain: 0.07 })
    loop(ctx, brown, api.buses.storm, { type: 'lowpass', freq: 180, q: 0.5, gain: 0.14 })

    api.nextPop = ctx.currentTime + 0.2
    api.nextBubble = ctx.currentTime + 0.2
  }

  function applyGains() {
    const ctx = api.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const open = api.started && !api.muted
    api.master.gain.cancelScheduledValues(now)
    api.master.gain.setTargetAtTime(open ? 0.78 : 0.0001, now, 0.06)
    for (const [id, gain] of Object.entries(api.buses)) {
      const level = open && id === api.pending ? 1 : 0
      gain.gain.cancelScheduledValues(now)
      gain.gain.setTargetAtTime(level, now, 0.28)
    }
  }

  async function unlock() {
    if (!api.ctx) build()
    await api.ctx.resume()
    api.started = true
    api.muted = false
    applyGains()
  }

  function setScene(id) {
    api.pending = id
    applyGains()
  }

  async function setMuted(muted) {
    if (!api.ctx) return
    api.muted = muted
    if (!muted) await api.ctx.resume()
    applyGains()
  }

  function blip(when, dest, { freq, amp, dur, type = 'sine', slide = 0.7 }) {
    const ctx = api.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(40, freq), when)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), when + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(amp, when + Math.min(0.012, dur * 0.2))
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    osc.connect(g)
    g.connect(dest)
    osc.start(when)
    osc.stop(when + dur + 0.02)
  }

  function pop(when, amp) {
    const ctx = api.ctx
    const src = ctx.createBufferSource()
    src.buffer = api.white
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 700 + Math.random() * 2400
    filter.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(amp, when + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045)
    src.connect(filter)
    filter.connect(g)
    g.connect(api.buses.eruption)
    src.start(when)
    src.stop(when + 0.06)
  }

  function strike(meters) {
    const ctx = api.ctx
    if (!ctx || api.muted || !api.started) return
    const delay = Math.min(4.2, Math.max(0.15, meters / 340))
    const t = ctx.currentTime + delay
    const amp = Math.min(0.85, 280 / Math.max(180, meters))
    const src = ctx.createBufferSource()
    src.buffer = api.white
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(520, t)
    filter.frequency.exponentialRampToValueAtTime(70, t + 1.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1)
    src.connect(filter)
    filter.connect(g)
    g.connect(api.master)
    src.start(t)
    src.stop(t + 2.2)
    blip(t, api.master, { freq: 78, amp: amp * 0.85, dur: 1.5, slide: 0.35 })
  }

  function update(time) {
    const ctx = api.ctx
    if (!ctx || !api.started || api.muted) return
    const now = ctx.currentTime
    if (api.pending === 'eruption' && api.roar) {
      const energy = eruptionEnergy(time)
      api.roar.amp.gain.setTargetAtTime(0.06 + energy * 0.2, now, 0.08)
      while (api.nextPop < now + 0.15) {
        pop(api.nextPop, 0.035 + Math.random() * 0.1 * energy)
        api.nextPop += 0.04 + Math.random() * 0.16
      }
    }
    if (api.pending === 'river' || api.pending === 'falls') {
      while (api.nextBubble < now + 0.12) {
        const falls = api.pending === 'falls'
        blip(api.nextBubble, api.buses[api.pending], {
          freq: falls ? 160 + Math.random() * 380 : 480 + Math.random() * 640,
          amp: falls ? 0.028 : 0.012,
          dur: falls ? 0.07 : 0.05,
          slide: 0.62,
        })
        api.nextBubble += falls ? 0.07 + Math.random() * 0.16 : 0.22 + Math.random() * 0.55
      }
    }
  }

  return api
}
