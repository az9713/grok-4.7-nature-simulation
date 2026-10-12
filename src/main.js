import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { createAudio } from './audio.js'
import { STRIKES, STORM_PERIOD } from './shared.js'
import { createRiver } from './scenes/river.js'
import { createFalls } from './scenes/falls.js'
import { createAurora } from './scenes/aurora.js'
import { createEruption } from './scenes/eruption.js'
import { createStorm } from './scenes/storm.js'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const scenes = [createRiver(), createFalls(), createAurora(), createEruption(), createStorm()]
const audio = createAudio()

const params = new URLSearchParams(location.search)
const queryIndex = scenes.findIndex((scene) => scene.id === params.get('scene'))

const stage = document.getElementById('stage')
const titleEl = document.getElementById('title')
const placeEl = document.getElementById('place')
const nav = document.getElementById('nav')
const soundBtn = document.getElementById('sound')
const veil = document.getElementById('veil')
const scope = document.getElementById('scope')
const scopeCtx = scope.getContext('2d')

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1
renderer.setClearColor(0x07080a, 1)
stage.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.12, 1800)
const look = new THREE.Vector3()

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.4, 0.82)
composer.addPass(bloom)
const grain = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.022 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = fract(sin(dot(vUv + fract(uTime * 0.17), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * uAmount;
      gl_FragColor = c;
    }
  `,
})
composer.addPass(grain)
composer.addPass(new OutputPass())

let index = queryIndex >= 0 ? queryIndex : 0
let active = null
let pointerX = 0
let pointerY = 0
let smoothX = 0
let smoothY = 0
let busy = false
let last = performance.now()
let elapsed = 0
let lastStormLocal = 0
const firedStrikes = new Set()

const buttons = scenes.map((item, i) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = item.title.replace(/^The /, '')
  button.addEventListener('click', () => go(i))
  nav.appendChild(button)
  return button
})

function resize() {
  const w = innerWidth
  const h = innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer.setSize(w, h)
}

function labelSound() {
  const on = audio.started && !audio.muted
  soundBtn.dataset.on = on ? 'true' : 'false'
  soundBtn.textContent = on ? 'Mute' : 'Hear the scene'
}

function show(next) {
  if (active) scene.remove(active.root)
  active = scenes[next]
  index = next
  scene.add(active.root)
  camera.fov = active.fov
  camera.updateProjectionMatrix()
  bloom.strength = active.bloom
  bloom.threshold = active.threshold
  bloom.radius = active.radius
  renderer.toneMappingExposure = active.exposure
  grain.uniforms.uAmount.value = active.id === 'aurora' || active.id === 'eruption' ? 0.032 : 0.02
  titleEl.textContent = active.title
  placeEl.textContent = active.place
  document.title = `${active.title} — Phenomena`
  buttons.forEach((button, i) => {
    if (i === index) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  })
  audio.setScene(active.id)
  placeCamera(0)
}

function placeCamera(time) {
  const drift = reduced ? 0 : active.drift
  const p = active.cameraPos
  camera.position.set(
    p.x + Math.sin(time * 0.07) * drift + smoothX * active.parallax,
    p.y + Math.sin(time * 0.05 + 1) * drift * 0.35 + smoothY * active.parallax * 0.25,
    p.z + Math.cos(time * 0.043) * drift * 0.4,
  )
  look.copy(active.cameraTarget)
  look.x += smoothX * 0.55
  look.y += smoothY * 0.22
  camera.lookAt(look)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function go(next) {
  if (busy || next === index) return
  busy = true
  veil.classList.add('on')
  await wait(reduced ? 0 : 200)
  show(next)
  requestAnimationFrame(() => veil.classList.remove('on'))
  await wait(reduced ? 0 : 240)
  busy = false
}

function drawScope() {
  const w = scope.width
  const h = scope.height
  scopeCtx.clearRect(0, 0, w, h)
  scopeCtx.strokeStyle = 'rgba(196, 164, 132, 0.9)'
  scopeCtx.lineWidth = 1.25
  scopeCtx.beginPath()
  if (!audio.started || audio.muted || !audio.analyser) {
    scopeCtx.moveTo(0, h / 2)
    scopeCtx.lineTo(w, h / 2)
    scopeCtx.stroke()
    return
  }
  audio.analyser.getByteTimeDomainData(audio.timeData)
  const data = audio.timeData
  const step = 4
  for (let i = 0; i < data.length; i += step) {
    const x = (i / (data.length - 1)) * w
    const y = (data[i] / 255) * h
    if (i === 0) scopeCtx.moveTo(x, y)
    else scopeCtx.lineTo(x, y)
  }
  scopeCtx.stroke()
}

function thunder(time) {
  if (active.id !== 'storm' || !audio.started || audio.muted) return
  const local = time % STORM_PERIOD
  if (local < lastStormLocal) firedStrikes.clear()
  lastStormLocal = local
  for (const strike of STRIKES) {
    if (local >= strike.t && local < strike.t + 0.05 && !firedStrikes.has(strike.t)) {
      firedStrikes.add(strike.t)
      audio.strike(strike.meters)
    }
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  elapsed += dt
  smoothX += (pointerX - smoothX) * 0.04
  smoothY += (pointerY - smoothY) * 0.04
  placeCamera(elapsed)
  active.update(elapsed, dt, camera)
  audio.update(elapsed)
  thunder(elapsed)
  grain.uniforms.uTime.value = elapsed
  composer.render()
  drawScope()
  if (!document.body.classList.contains('ready')) document.body.classList.add('ready')
  requestAnimationFrame(frame)
}

soundBtn.addEventListener('click', async () => {
  if (!audio.started) await audio.unlock()
  else await audio.setMuted(!audio.muted)
  labelSound()
})

window.addEventListener('pointerdown', async (event) => {
  if (event.target.closest('button')) return
  if (!audio.started) {
    await audio.unlock()
    labelSound()
  }
})

window.addEventListener('pointermove', (event) => {
  pointerX = (event.clientX / innerWidth) * 2 - 1
  pointerY = (event.clientY / innerHeight) * 2 - 1
})

let swipeX = 0
window.addEventListener('pointerdown', (event) => {
  swipeX = event.clientX
})
window.addEventListener('pointerup', (event) => {
  if (event.target.closest('button')) return
  const dx = event.clientX - swipeX
  if (dx > 70) go((index + scenes.length - 1) % scenes.length)
  else if (dx < -70) go((index + 1) % scenes.length)
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    go((index + 1) % scenes.length)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    go((index + scenes.length - 1) % scenes.length)
  } else if (event.key >= '1' && event.key <= '5') {
    go(Number(event.key) - 1)
  } else if (event.key === 'm') {
    soundBtn.click()
  }
})

window.addEventListener('resize', resize)
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return
  if (document.hidden) audio.ctx.suspend()
  else if (audio.started && !audio.muted) audio.ctx.resume()
})

try {
  show(index)
  resize()
  requestAnimationFrame(frame)
} catch (error) {
  console.error(error)
  document.body.classList.add('failed')
  document.getElementById('fail').textContent = `This piece needs WebGL. ${error.message}`
}
