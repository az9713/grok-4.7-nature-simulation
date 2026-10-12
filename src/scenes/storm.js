import * as THREE from 'three'
import { NOISE, SKY } from '../lib.glsl.js'
import { mulberry32 } from '../noise.js'
import { createSky } from '../sky.js'
import { activeStrike, lightningFlash } from '../shared.js'

const sun = new THREE.Vector3(0.2, 0.35, -0.4).normalize()

function makeBolt(rng) {
  const pts = []
  let x = 0
  let y = 0
  for (let i = 0; i < 18; i++) {
    pts.push({ x, y })
    x += (rng() - 0.5) * 1.25
    y -= 0.48 + rng() * 0.42
  }
  const positions = []
  const uvs = []
  const indices = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const w = 0.045
    positions.push(pts[i].x + -ty * w, pts[i].y + tx * w, 0)
    positions.push(pts[i].x - -ty * w, pts[i].y - tx * w, 0)
    uvs.push(0, i / (pts.length - 1), 1, i / (pts.length - 1))
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

export function createStorm() {
  const root = new THREE.Group()
  const sky = createSky({ mode: 2, sun })
  root.add(sky.mesh)

  const seaGeo = new THREE.PlaneGeometry(220, 220, 180, 180)
  seaGeo.rotateX(-Math.PI / 2)
  const seaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uSun: { value: sun },
      uMoon: { value: new THREE.Vector3(0, -0.2, 0.1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      uniform float uTime;
      float wave(vec2 p) {
        float h = 0.0;
        h += sin(dot(p, vec2(0.16, 0.22)) + uTime * 0.55) * 0.42;
        h += sin(dot(p, vec2(-0.31, 0.12)) + uTime * 0.8) * 0.22;
        h += sin(dot(p, vec2(0.08, 0.48)) + uTime * 1.15) * 0.1;
        h += sin(dot(p, vec2(0.7, -0.2)) + uTime * 1.5) * 0.04;
        return h;
      }
      void main() {
        vec3 pos = position;
        pos.y = wave(pos.xz);
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY}
      varying vec3 vWorld;
      uniform float uTime;
      uniform float uFlash;
      uniform vec3 uSun;
      uniform vec3 uMoon;
      void main() {
        vec3 n = normalize(cross(dFdy(vWorld), dFdx(vWorld)));
        if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
        vec3 I = normalize(vWorld - cameraPosition);
        vec3 R = reflect(I, n);
        vec3 env = skyColor(R, uSun, uMoon, uTime, 2.0, uFlash, 0.0);
        float fres = pow(1.0 - max(dot(-I, n), 0.0), 5.0);
        fres = mix(0.06, 1.0, fres);
        vec3 deep = vec3(0.012, 0.02, 0.026);
        vec3 col = mix(deep, env * vec3(0.55, 0.6, 0.64), fres);
        float crest = smoothstep(0.42, 0.72, vWorld.y);
        float foamNoise = vnoise(vWorld.xz * 1.4 + vec2(uTime * 0.15, -uTime * 0.05));
        col = mix(col, vec3(0.62, 0.66, 0.68), crest * foamNoise * 0.65);
        col += vec3(0.55, 0.6, 0.66) * uFlash * (0.18 + fres * 0.45);
        float dist = length(vWorld.xz);
        col = mix(col, vec3(0.16, 0.17, 0.18), 1.0 - exp(-dist * 0.012));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  root.add(new THREE.Mesh(seaGeo, seaMat))

  const rng = mulberry32(11)
  const bolts = []
  const boltMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uFlash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uFlash;
      void main() {
        float core = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
        float a = core * uFlash;
        vec3 col = mix(vec3(0.55, 0.7, 1.0), vec3(1.0), core);
        gl_FragColor = vec4(col * a, a);
      }
    `,
  })
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(makeBolt(rng), boltMat)
    mesh.position.set(-16 + i * 10, 9 + rng() * 2, -22 - rng() * 8)
    mesh.scale.setScalar(3.6 + rng() * 1.4)
    mesh.rotation.y = (rng() - 0.5) * 0.4
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    root.add(mesh)
    bolts.push(mesh)
  }

  function rain(count, box, speed, size) {
    const geo = new THREE.BufferGeometry()
    const seeds = new Float32Array(count)
    const offsets = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      seeds[i] = Math.random()
      offsets[i * 3] = (Math.random() - 0.5) * box
      offsets[i * 3 + 1] = Math.random()
      offsets[i * 3 + 2] = (Math.random() - 0.5) * box
    }
    geo.setAttribute('position', new THREE.BufferAttribute(offsets, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uFlash: { value: 0 },
        uSpeed: { value: speed },
        uSize: { value: size },
        uBox: { value: box },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying float vSeed;
        uniform float uTime;
        uniform vec3 uCam;
        uniform float uSpeed;
        uniform float uSize;
        uniform float uBox;
        void main() {
          vSeed = aSeed;
          float life = fract(aSeed + uTime * uSpeed);
          vec3 pos;
          pos.x = uCam.x + mod(position.x + uTime * 1.4 + uBox * 0.5, uBox) - uBox * 0.5;
          pos.z = uCam.z + mod(position.z + uBox * 0.5, uBox) - uBox * 0.5;
          pos.y = uCam.y + 7.0 - life * 14.0;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (1.6 / max(0.4, -mv.z));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vSeed;
        uniform float uFlash;
        void main() {
          vec2 p = gl_PointCoord;
          float streak = smoothstep(0.5, 0.0, abs(p.x - 0.5) * 7.0);
          streak *= smoothstep(0.0, 0.15, p.y) * smoothstep(1.0, 0.35, p.y);
          if (streak < 0.02) discard;
          vec3 col = mix(vec3(0.62, 0.66, 0.7), vec3(0.9, 0.95, 1.0), uFlash);
          float a = streak * 0.28;
          gl_FragColor = vec4(col, a);
        }
      `,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 6
    return { points, mat }
  }

  const nearRain = rain(2800, 18, 1.6, 36)
  const farRain = rain(3400, 48, 0.85, 14)
  root.add(nearRain.points)
  root.add(farRain.points)

  return {
    id: 'storm',
    title: 'The storm',
    place: 'Open water',
    root,
    fov: 54,
    drift: 0.16,
    parallax: 0.3,
    bloom: 0.34,
    threshold: 0.72,
    radius: 0.36,
    exposure: 0.88,
    cameraPos: new THREE.Vector3(0.4, 1.85, 6),
    cameraTarget: new THREE.Vector3(1.2, 0.55, -24),
    update(time, _dt, camera) {
      const flash = lightningFlash(time)
      sky.uniforms.uTime.value = time
      sky.uniforms.uFlash.value = flash
      seaMat.uniforms.uTime.value = time
      seaMat.uniforms.uFlash.value = flash
      boltMat.uniforms.uFlash.value = flash
      const strike = activeStrike(time)
      bolts.forEach((bolt, i) => {
        bolt.visible = strike >= 0 && strike % 4 === i
      })
      nearRain.mat.uniforms.uTime.value = time
      nearRain.mat.uniforms.uFlash.value = flash
      nearRain.mat.uniforms.uCam.value.copy(camera.position)
      farRain.mat.uniforms.uTime.value = time
      farRain.mat.uniforms.uFlash.value = flash
      farRain.mat.uniforms.uCam.value.copy(camera.position)
    },
  }
}
