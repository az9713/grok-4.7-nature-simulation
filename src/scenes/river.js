import * as THREE from 'three'
import { NOISE, SKY } from '../lib.glsl.js'
import { fbm, mulberry32, smoothstep } from '../noise.js'
import { createSky } from '../sky.js'
import { addRock } from '../rocks.js'

export function riverCenter(z) {
  return Math.sin(z * 0.075) * 5.2 + Math.sin(z * 0.019 + 1.2) * 3.1 + Math.sin(z * 0.21) * 0.55
}

export function halfWidth(z) {
  return 2.25 + Math.sin(z * 0.13) * 0.5 + Math.sin(z * 0.05 + 2.0) * 0.32
}

export function terrainHeight(x, z) {
  const c = riverCenter(z)
  const half = halfWidth(z)
  const d = Math.abs(x - c)
  const bank = smoothstep(half * 0.82, half + 5.2, d)
  const n = fbm(x * 0.16, z * 0.16)
  const broad = fbm(x * 0.045 + 4.0, z * 0.045)
  const sideHill = smoothstep(half + 6.0, half + 18.0, d) * Math.max(0, fbm(x * 0.06, z * 0.06) - 0.38) * 8.0
  return -0.28 + bank * (0.42 + n * 0.85 + broad * 0.9) + sideHill
}

const sun = new THREE.Vector3(-0.22, 0.17, -1).normalize()
const sunColor = new THREE.Color(1.0, 0.62, 0.32)

export function createRiver() {
  const root = new THREE.Group()
  const sky = createSky({ mode: 0, sun })
  root.add(sky.mesh)

  const ground = new THREE.PlaneGeometry(150, 170, 180, 200)
  ground.rotateX(-Math.PI / 2)
  const gp = ground.attributes.position
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i)
    const z = gp.getZ(i)
    gp.setY(i, terrainHeight(x, z))
  }
  ground.computeVertexNormals()
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sun },
      uSunColor: { value: sunColor },
    },
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
      uniform vec3 uSun;
      uniform vec3 uSunColor;
      void main() {
        vec3 n = normalize(vNormal);
        float h = fbm(vWorld.xz * 2.4);
        float grit = vnoise(vWorld.xz * 16.0);
        n = normalize(n - dFdx(vWorld) * dFdx(h) * 1.4 - dFdy(vWorld) * dFdy(h) * 1.4);
        n = normalize(n - dFdx(vWorld) * dFdx(grit) * 0.08 - dFdy(vWorld) * dFdy(grit) * 0.08);
        float grain = fbm(vWorld.xz * 0.85);
        float fine = fbm(vWorld.xz * 6.0);
        vec3 mud = vec3(0.17, 0.11, 0.06);
        vec3 grass = vec3(0.24, 0.18, 0.07);
        vec3 forest = vec3(0.07, 0.09, 0.045);
        vec3 albedo = mix(mud, grass, smoothstep(-0.05, 0.7, vWorld.y));
        albedo = mix(albedo, forest, smoothstep(1.1, 3.4, vWorld.y));
        albedo *= 0.78 + 0.34 * grain;
        albedo = mix(albedo, albedo * (0.82 + 0.28 * grit), 0.55);
        albedo = mix(albedo, albedo * 0.72, fine * 0.35);
        float wet = smoothstep(0.85, 0.02, vWorld.y);
        albedo = mix(albedo, albedo * vec3(0.32, 0.28, 0.22), wet);
        float cavity = smoothstep(0.58, 0.25, fbm(vWorld.xz * 1.3));
        albedo *= mix(1.0, 0.7, cavity);
        float ndl = max(dot(n, normalize(uSun)), 0.0);
        vec3 hemi = mix(vec3(0.16, 0.08, 0.05), vec3(0.45, 0.24, 0.14), n.y * 0.5 + 0.5);
        vec3 col = albedo * (hemi + uSunColor * ndl * 1.25);
        vec3 view = normalize(cameraPosition - vWorld);
        float spec = pow(max(dot(n, normalize(normalize(uSun) + view)), 0.0), mix(12.0, 80.0, wet));
        col += uSunColor * spec * wet * 0.18;
        float dist = length(vWorld - cameraPosition);
        vec3 fog = vec3(0.72, 0.40, 0.24);
        col = mix(col, fog, 1.0 - exp(-dist * 0.011));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  root.add(new THREE.Mesh(ground, groundMat))

  const z0 = -58
  const z1 = 36
  const segs = 140
  const positions = []
  const uvs = []
  const indices = []
  for (let i = 0; i <= segs; i++) {
    const z = z0 + ((z1 - z0) * i) / segs
    const c = riverCenter(z)
    const half = halfWidth(z)
    const z2 = z + 0.3
    const c2 = riverCenter(z2)
    let tx = c2 - c
    let tz = z2 - z
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    const px = -tz
    const pz = tx
    const y = 0.16
    positions.push(c - px * half, y, z - pz * half, c + px * half, y, z + pz * half)
    uvs.push(0, i / segs, 1, i / segs)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const waterGeo = new THREE.BufferGeometry()
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  waterGeo.setIndex(indices)
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: sun },
      uMoon: { value: new THREE.Vector3(0, -1, 0) },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float w = sin(pos.x * 0.85 + pos.z * 0.55 - uTime * 1.1) * 0.018;
        w += sin(pos.z * 1.7 - uTime * 1.6) * 0.01;
        pos.y += w;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY}
      varying vec3 vWorld;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uSun;
      uniform vec3 uMoon;
      void main() {
        float edge = smoothstep(0.18, 0.48, abs(vUv.x - 0.5));
        vec2 flow = vec2(0.15, 1.0);
        vec2 perp = vec2(-flow.y, flow.x);
        vec2 uv1 = vec2(dot(vWorld.xz, perp) * 0.55, dot(vWorld.xz, flow) * 0.35 - uTime * 0.35);
        vec2 uv2 = vec2(dot(vWorld.xz, perp) * 1.3, dot(vWorld.xz, flow) * 0.8 - uTime * 0.62);
        float h = vnoise(uv1 * 5.0) * 0.45 + vnoise(uv2 * 9.0) * 0.25 + vnoise(uv2 * 22.0) * 0.12;
        vec3 n = normalize(vec3(-dFdx(h) * 2.4, 1.0, -dFdy(h) * 2.4));
        vec3 I = normalize(vWorld - cameraPosition);
        vec3 R = reflect(I, n);
        vec3 env = skyColor(R, uSun, uMoon, uTime, 0.0, 0.0, 0.0);
        float fres = pow(1.0 - max(dot(-I, n), 0.0), 5.0);
        fres = mix(0.04, 1.0, fres);
        vec3 deep = vec3(0.03, 0.05, 0.045);
        vec3 col = mix(deep, env, fres);
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 halfV = normalize(normalize(uSun) + view);
        float tight = pow(max(dot(n, halfV), 0.0), 700.0);
        float broad = pow(max(dot(n, halfV), 0.0), 36.0);
        float glint = step(0.8, vnoise(vWorld.xz * 16.0 + vec2(0.0, -uTime * 0.5)));
        vec3 spec = vec3(1.0, 0.78, 0.48);
        col += spec * (tight * 1.6 + broad * 0.08 + broad * glint * 2.8);
        float foam = edge * (0.35 + 0.65 * vnoise(uv2 * 2.0));
        col = mix(col, vec3(0.85, 0.72, 0.58), foam * 0.28);
        float dist = length(vWorld - cameraPosition);
        col = mix(col, vec3(0.72, 0.40, 0.24), 1.0 - exp(-dist * 0.011));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.renderOrder = 2
  root.add(water)

  const rng = mulberry32(19)
  for (let i = 0; i < 7; i++) {
    const z = -16 + rng() * 12
    const side = rng() < 0.5 ? -1 : 1
    const x = riverCenter(z) + side * (halfWidth(z) * (0.35 + rng() * 0.45))
    const radius = 0.18 + rng() * 0.42
    addRock(root, {
      x,
      z,
      groundY: 0.12,
      radius,
      seed: 3 + i * 1.7,
      sunDir: sun,
      sunColor,
      wet: 0.45,
      tint: new THREE.Color(0.78, 0.62, 0.46),
      key: 'river-rock',
    })
  }

  const camZ = 15
  return {
    id: 'river',
    title: 'The river',
    place: 'Low sun on the water',
    root,
    fov: 46,
    drift: 0.12,
    parallax: 0.35,
    bloom: 0.14,
    threshold: 0.92,
    radius: 0.32,
    exposure: 1.02,
    cameraPos: new THREE.Vector3(riverCenter(camZ) + 3.1, 1.55, camZ),
    cameraTarget: new THREE.Vector3(riverCenter(-12), 0.72, -14),
    update(time) {
      sky.uniforms.uTime.value = time
      waterMat.uniforms.uTime.value = time
    },
  }
}
