import * as THREE from 'three'
import { NOISE, SKY } from '../lib.glsl.js'
import { fbm, mulberry32, peakShape } from '../noise.js'
import { createSky } from '../sky.js'
import { addRock } from '../rocks.js'

const sun = new THREE.Vector3(-0.85, 0.15, -0.2).normalize()
const moon = new THREE.Vector3(-0.72, 0.48, -0.35).normalize()
const moonColor = new THREE.Color(0.62, 0.7, 0.86)

function rangeMesh(z, scale, color) {
  const segs = 90
  const positions = []
  const uvs = []
  const indices = []
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * 110 - 55
    const y = peakShape(x) * scale
    positions.push(x, -2, z, x, y, z)
    uvs.push(i / segs, 0, i / segs, 1)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uMoon: { value: moon } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform vec3 uColor;
      uniform vec3 uMoon;
      void main() {
        float rim = pow(vUv.y, 2.2);
        float ndl = max(dot(normalize(vNormal), normalize(uMoon)), 0.0);
        vec3 col = uColor + vec3(0.08, 0.1, 0.16) * rim * 0.35 + vec3(0.12, 0.14, 0.2) * ndl * rim;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  return new THREE.Mesh(geo, mat)
}

export function createAurora() {
  const root = new THREE.Group()
  const sky = createSky({
    mode: 1,
    sun,
    moon,
    aurora: 1,
  })
  root.add(sky.mesh)
  root.add(rangeMesh(-36, 1.15, new THREE.Color(0.035, 0.045, 0.07)))
  root.add(rangeMesh(-18, 0.85, new THREE.Color(0.008, 0.01, 0.018)))

  const snowGeo = new THREE.PlaneGeometry(90, 90, 120, 120)
  snowGeo.rotateX(-Math.PI / 2)
  const sp = snowGeo.attributes.position
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i)
    const z = sp.getZ(i)
    const r = Math.hypot(x, z)
    let y = fbm(x * 0.35, z * 0.35) * 0.05
    if (r < 13.5) y = -0.45
    if (r > 14.8) y += (r - 14.8) * 0.05 + Math.max(0, fbm(x * 0.12, z * 0.12) - 0.42) * 1.5
    sp.setY(i, y)
  }
  snowGeo.computeVertexNormals()
  const snow = new THREE.Mesh(
    snowGeo,
    new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: moon } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        ${NOISE}
        varying vec3 vWorld;
        varying vec3 vNormal;
        uniform vec3 uMoon;
        void main() {
          vec3 n = normalize(vNormal);
          float h = fbm(vWorld.xz * 3.0);
          n = normalize(n - dFdx(vWorld) * dFdx(h) * 1.4 - dFdy(vWorld) * dFdy(h) * 1.4);
          vec3 albedo = vec3(0.72, 0.75, 0.78);
          albedo *= 0.9 + 0.15 * fbm(vWorld.xz * 8.0);
          float ndl = max(dot(n, normalize(uMoon)), 0.0);
          vec3 col = albedo * (vec3(0.025, 0.04, 0.07) + vec3(0.55, 0.62, 0.8) * ndl);
          col += vec3(0.05, 0.16, 0.1);
          float spark = step(0.996, hash12(floor(vWorld.xz * 34.0)));
          col += spark * 0.7;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  )
  root.add(snow)

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(13.4, 72),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: sun },
        uMoon: { value: moon },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        uniform float uTime;
        void main() {
          vec3 pos = position;
          float w = sin(pos.x * 0.7 + uTime * 0.35) * 0.012 + sin(pos.y * 0.9 - uTime * 0.22) * 0.008;
          pos.z += w;
          vec4 world = modelMatrix * vec4(pos, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        ${SKY}
        varying vec3 vWorld;
        uniform float uTime;
        uniform vec3 uSun;
        uniform vec3 uMoon;
        void main() {
          vec2 uv = vWorld.xz * 0.22;
          float h = vnoise(uv * 2.0 + uTime * 0.04) * 0.7 + vnoise(uv * 5.0 - uTime * 0.06) * 0.3;
          vec3 n = normalize(vec3(-dFdx(h) * 0.7, 1.0, -dFdy(h) * 0.7));
          vec3 I = normalize(vWorld - cameraPosition);
          vec3 R = reflect(I, n);
          vec3 env = skyColor(R, uSun, uMoon, uTime, 1.0, 0.0, 1.0);
          env = mix(vec3(0.01, 0.014, 0.02), env, smoothstep(-0.02, 0.06, R.y));
          float fres = pow(1.0 - max(dot(-I, n), 0.0), 5.0);
          vec3 col = mix(env * 0.72, env, fres);
          col *= vec3(0.78, 0.86, 0.84);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  )
  lake.rotation.x = -Math.PI / 2
  lake.position.y = 0.04
  root.add(lake)

  const rng = mulberry32(4)
  for (let i = 0; i < 5; i++) {
    const ang = rng() * Math.PI * 2
    const r = 14.2 + rng() * 3.5
    const x = Math.cos(ang) * r
    const z = Math.sin(ang) * r * 0.85
    addRock(root, {
      x,
      z,
      groundY: 0.05,
      radius: 0.22 + rng() * 0.35,
      seed: 30 + i,
      sunDir: moon,
      sunColor: moonColor,
      wet: 0.15,
      tint: new THREE.Color(0.35, 0.38, 0.42),
      key: 'aurora-rock',
    })
  }

  return {
    id: 'aurora',
    title: 'The aurora',
    place: 'Still water, polar night',
    root,
    fov: 52,
    drift: 0.1,
    parallax: 0.28,
    bloom: 0.32,
    threshold: 0.72,
    radius: 0.48,
    exposure: 1.02,
    cameraPos: new THREE.Vector3(0.3, 1.42, 16.5),
    cameraTarget: new THREE.Vector3(0, 2.6, -10),
    update(time) {
      sky.uniforms.uTime.value = time
      lake.material.uniforms.uTime.value = time
    },
  }
}
