import * as THREE from 'three'
import { NOISE } from '../lib.glsl.js'
import { fbm, mulberry32 } from '../noise.js'
import { createSky } from '../sky.js'
import { addRock } from '../rocks.js'

const sun = new THREE.Vector3(0.42, 0.74, 0.62).normalize()
const sunColor = new THREE.Color(1.0, 0.94, 0.82)

function displacedWall(width, height, segsX, segsY) {
  const geo = new THREE.PlaneGeometry(width, height, segsX, segsY)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const n = fbm(x * 0.42 + 2.0, y * 0.42)
    const n2 = fbm(x * 1.3, y * 0.35 + 5.0)
    pos.setZ(i, (n - 0.35) * 0.28 + (n2 - 0.4) * 0.08)
  }
  geo.computeVertexNormals()
  return geo
}

const rockFragment = /* glsl */ `
${NOISE}
varying vec3 vWorld;
varying vec3 vNormal;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uTime;
void main() {
  vec3 n = normalize(vNormal);
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  float h = fbm(vWorld.xy * 1.5 + vWorld.yz * 0.4);
  n = normalize(n - dFdx(vWorld) * dFdx(h) * 2.4 - dFdy(vWorld) * dFdy(h) * 2.4);
  float grain = fbm(vWorld.xz * 0.5 + vWorld.xy * 0.35);
  vec3 albedo = mix(vec3(0.07, 0.065, 0.06), vec3(0.16, 0.145, 0.13), grain);
  float moss = smoothstep(0.58, 0.84, fbm(vWorld.xz * 0.7 + vWorld.y * 0.1));
  albedo = mix(albedo, vec3(0.08, 0.11, 0.05), moss * clamp(vWorld.y / 8.0, 0.0, 1.0));
  float seep = smoothstep(0.66, 0.92, vnoise(vec2(vWorld.x * 2.2, vWorld.y * 0.32)));
  float wet = clamp((1.0 - smoothstep(0.15, 3.2, vWorld.y)) * 0.85 + seep * 0.75, 0.0, 1.0);
  albedo *= mix(1.0, 0.38, wet);
  float cavity = smoothstep(0.6, 0.22, fbm(vWorld.xy * 0.85));
  albedo *= mix(1.0, 0.5, cavity);
  vec3 sunDir = normalize(uSun);
  float ndl = max(dot(n, sunDir), 0.0);
  vec3 hemi = mix(vec3(0.05, 0.06, 0.05), vec3(0.35, 0.38, 0.36), n.y * 0.5 + 0.5);
  vec3 col = albedo * (hemi + uSunColor * ndl * 1.2);
  vec3 view = normalize(cameraPosition - vWorld);
  float spec = pow(max(dot(n, normalize(sunDir + view)), 0.0), mix(20.0, 140.0, wet));
  col += vec3(0.85, 0.92, 0.9) * spec * wet * 0.4;
  float dist = length(vWorld - cameraPosition);
  col = mix(col, vec3(0.45, 0.5, 0.5), 1.0 - exp(-dist * 0.006));
  gl_FragColor = vec4(col, 1.0);
}
`

function rockMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sun },
      uSunColor: { value: sunColor },
      uTime: { value: 0 },
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
    fragmentShader: rockFragment,
  })
}

function waterSheet(width, height, speed) {
  const geo = new THREE.PlaneGeometry(width, height, 1, 24)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: speed },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${NOISE}
      varying vec2 vUv;
      uniform float uTime;
      uniform float uSpeed;
      void main() {
        vec2 uv = vUv;
        float slide = uv.y * 0.35 + uTime * uSpeed;
        float streak = vnoise(vec2(uv.x * 10.0, slide * 2.2));
        float fine = vnoise(vec2(uv.x * 36.0 + streak, slide * 6.0));
        float edge = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x);
        float spray = smoothstep(0.22, 0.0, uv.y);
        float alpha = edge * (0.78 + 0.18 * streak);
        alpha *= mix(1.0, 0.25 + fine * 0.75, spray);
        vec3 col = mix(vec3(0.42, 0.5, 0.48), vec3(0.93, 0.95, 0.94), streak);
        float vein = smoothstep(0.62, 0.92, fine);
        col = mix(col, vec3(0.18, 0.24, 0.23), vein * (1.0 - spray) * 0.72);
        col += vec3(0.9, 0.95, 0.93) * streak * (1.0 - vein) * 0.25;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.94));
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 3
  return { mesh, mat }
}

export function createFalls() {
  const root = new THREE.Group()
  const sky = createSky({ mode: 3, sun })
  root.add(sky.mesh)

  const cliff = new THREE.Mesh(displacedWall(26, 12, 80, 60), rockMaterial())
  cliff.position.set(0, 5.4, 0)
  root.add(cliff)

  const lip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 1.6), rockMaterial())
  lip.position.set(0, 8.7, 0.85)
  root.add(lip)

  const floorGeo = new THREE.PlaneGeometry(28, 22, 80, 60)
  floorGeo.rotateX(-Math.PI / 2)
  const fp = floorGeo.attributes.position
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i)
    const z = fp.getZ(i)
    const pool = Math.exp(-(x * x + (z - 4.5) * (z - 4.5)) / 16)
    fp.setY(i, -0.05 - pool * 0.4 + fbm(x * 0.35, z * 0.35) * 0.12)
  }
  floorGeo.computeVertexNormals()
  const floor = new THREE.Mesh(floorGeo, rockMaterial())
  root.add(floor)

  const sheets = [
    waterSheet(3.4, 8.2, 0.95),
    waterSheet(2.4, 8.0, 1.25),
    waterSheet(1.3, 7.6, 1.55),
  ]
  sheets[0].mesh.position.set(0, 4.5, 0.72)
  sheets[1].mesh.position.set(0.05, 4.45, 0.86)
  sheets[2].mesh.position.set(-0.08, 4.55, 0.98)
  for (const sheet of sheets) root.add(sheet.mesh)

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(8.5, 7.5, 40, 30),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uSun: { value: sun } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float d = length(pos.xy - vec2(0.0, -1.4));
          pos.z += sin(d * 5.5 - uTime * 3.4) * 0.015 * exp(-d * 0.25);
          vec4 world = modelMatrix * vec4(pos, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        ${NOISE}
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform float uTime;
        uniform vec3 uSun;
        void main() {
          vec2 p = vWorld.xz;
          float d = length(p - vec2(0.0, 1.2));
          float rip = sin(d * 7.0 - uTime * 4.0);
          vec3 n = normalize(vec3(dFdx(rip), 1.0, dFdy(rip)));
          vec3 I = normalize(vWorld - cameraPosition);
          float fres = pow(1.0 - max(dot(-I, n), 0.0), 4.0);
          vec3 deep = vec3(0.05, 0.1, 0.09);
          vec3 col = mix(deep, vec3(0.75, 0.82, 0.8), fres);
          float foam = smoothstep(1.6, 0.2, d) * (0.45 + 0.55 * vnoise(p * 2.0 + vec2(0.0, uTime * 0.4)));
          foam += smoothstep(0.35, 0.0, abs(rip)) * exp(-d * 0.35) * 0.35;
          col = mix(col, vec3(0.92, 0.95, 0.94), clamp(foam, 0.0, 1.0));
          gl_FragColor = vec4(col, 0.82);
        }
      `,
    }),
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.set(0, 0.08, 4.6)
  pool.renderOrder = 2
  root.add(pool)

  const mistCount = 1800
  const mistGeo = new THREE.BufferGeometry()
  const seeds = new Float32Array(mistCount)
  const sizes = new Float32Array(mistCount)
  const base = new Float32Array(mistCount * 3)
  const rng = mulberry32(8)
  for (let i = 0; i < mistCount; i++) {
    seeds[i] = rng()
    sizes[i] = 36 + rng() * 90
    base[i * 3] = (rng() - 0.5) * 3.2
    base[i * 3 + 1] = rng()
    base[i * 3 + 2] = rng()
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(base, 3))
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  mistGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      varying float vLife;
      uniform float uTime;
      void main() {
        float life = fract(aSeed + uTime * (0.05 + aSeed * 0.04));
        vLife = life;
        vec3 pos;
        pos.x = position.x + sin(uTime * 0.3 + aSeed * 12.0) * 0.4;
        pos.y = 0.3 + life * 2.8;
        pos.z = 1.0 + position.z * 2.2 + life * 0.8;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (1.4 / max(0.3, -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        a *= smoothstep(0.0, 0.2, vLife) * smoothstep(1.0, 0.45, vLife);
        vec3 col = vec3(0.78, 0.82, 0.8);
        gl_FragColor = vec4(col, a * 0.16);
      }
    `,
  })
  const mist = new THREE.Points(mistGeo, mistMat)
  mist.frustumCulled = false
  mist.renderOrder = 4
  root.add(mist)

  const bow = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 6),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uSun: { value: sun } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        ${NOISE}
        varying vec3 vWorld;
        varying vec2 vUv;
        uniform vec3 uSun;
        void main() {
          vec3 rd = normalize(vWorld - cameraPosition);
          vec3 anti = -normalize(uSun);
          float ang = degrees(acos(clamp(dot(rd, anti), -1.0, 1.0)));
          float d = abs(ang - 42.0);
          float band = smoothstep(2.4, 0.15, d);
          float d2 = abs(ang - 51.0);
          float band2 = smoothstep(1.5, 0.2, d2) * 0.35;
          float hue = clamp((ang - 40.2) / 3.4, 0.0, 1.0);
          vec3 rainbow = mix(vec3(0.9), hsv(hue), 0.55);
          float fade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.62, vUv.y);
          fade *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float a = (band + band2) * fade * 0.28;
          gl_FragColor = vec4(rainbow * a, a);
        }
      `,
    }),
  )
  bow.position.set(0.2, 2.3, 2.1)
  bow.renderOrder = 5
  root.add(bow)

  const rng2 = mulberry32(21)
  for (let i = 0; i < 6; i++) {
    const x = (rng2() - 0.5) * 4.5
    const z = 2.2 + rng2() * 3.5
    addRock(root, {
      x,
      z,
      groundY: 0.0,
      radius: 0.28 + rng2() * 0.45,
      seed: 10 + i,
      sunDir: sun,
      sunColor,
      wet: 0.7,
      tint: new THREE.Color(0.45, 0.42, 0.38),
      key: 'falls-rock',
    })
  }

  const mats = [cliff.material, lip.material, floor.material]
  return {
    id: 'falls',
    title: 'The falls',
    place: 'Mist in the gorge',
    root,
    fov: 42,
    drift: 0.08,
    parallax: 0.22,
    bloom: 0.1,
    threshold: 0.9,
    radius: 0.28,
    exposure: 0.92,
    cameraPos: new THREE.Vector3(0.15, 1.7, 7.6),
    cameraTarget: new THREE.Vector3(0, 3.6, 0.3),
    update(time) {
      sky.uniforms.uTime.value = time
      for (const sheet of sheets) sheet.mat.uniforms.uTime.value = time
      pool.material.uniforms.uTime.value = time
      mistMat.uniforms.uTime.value = time
      for (const mat of mats) mat.uniforms.uTime.value = time
    },
  }
}
