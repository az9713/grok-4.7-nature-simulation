import * as THREE from 'three'
import { NOISE } from '../lib.glsl.js'
import { fbm } from '../noise.js'
import { createSky } from '../sky.js'
import { eruptionEnergy } from '../shared.js'

function craterHeight(x, z) {
  const r = Math.hypot(x, z)
  const rim = Math.exp(-((r - 7.0) ** 2) / 2.4) * 4.1
  const bowl = Math.exp(-(r * r) / 24) * -3.35
  const detail = (fbm(x * 0.38, z * 0.38) - 0.45) * 0.8
  const outer = -Math.max(0, r - 9.2) * 0.16
  return 1.35 + rim + bowl + detail + outer
}

const moon = new THREE.Vector3(0.78, 0.42, -0.28).normalize()
const moonColor = new THREE.Color(0.45, 0.52, 0.7)

export function createEruption() {
  const root = new THREE.Group()
  const sky = createSky({
    mode: 1,
    sun: moon,
    moon,
    aurora: 0,
    lift: new THREE.Vector3(0.08, 0.015, 0.0),
  })
  root.add(sky.mesh)

  const ground = new THREE.PlaneGeometry(48, 48, 200, 200)
  ground.rotateX(-Math.PI / 2)
  const gp = ground.attributes.position
  let bowl = 10
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i)
    const z = gp.getZ(i)
    const y = craterHeight(x, z)
    gp.setY(i, y)
    if (Math.hypot(x, z) < 2) bowl = Math.min(bowl, y)
  }
  ground.computeVertexNormals()
  const lavaY = bowl + 0.22

  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      uMoon: { value: moon },
      uMoonColor: { value: moonColor },
      uLavaY: { value: lavaY },
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
    fragmentShader: /* glsl */ `
      ${NOISE}
      varying vec3 vWorld;
      varying vec3 vNormal;
      uniform vec3 uMoon;
      uniform vec3 uMoonColor;
      uniform float uLavaY;
      uniform float uTime;
      void main() {
        vec3 n = normalize(vNormal);
        float h = fbm(vWorld.xz * 2.2);
        n = normalize(n - dFdx(vWorld) * dFdx(h) * 2.0 - dFdy(vWorld) * dFdy(h) * 2.0);
        float grain = fbm(vWorld.xz * 1.1);
        vec3 albedo = mix(vec3(0.045, 0.04, 0.038), vec3(0.11, 0.09, 0.08), grain);
        float cavity = smoothstep(0.6, 0.25, fbm(vWorld.xz * 1.6));
        albedo *= mix(1.0, 0.55, cavity);
        float ndl = max(dot(n, normalize(uMoon)), 0.0);
        vec3 col = albedo * (vec3(0.05, 0.055, 0.07) + uMoonColor * ndl * 1.4);
        vec3 lp = vec3(0.0, uLavaY + 0.2, 0.0);
        vec3 toL = lp - vWorld;
        float ld = length(toL);
        toL /= max(ld, 0.001);
        float lavaLight = max(dot(n, toL), 0.0) / (1.0 + ld * ld * 0.015);
        col += vec3(1.0, 0.34, 0.05) * lavaLight * 1.6;
        col += albedo * vec3(1.0, 0.32, 0.05) * lavaLight * 5.0;
        float r = length(vWorld.xz);
        float shore = smoothstep(5.2, 3.4, r) * smoothstep(uLavaY - 0.4, uLavaY + 0.8, vWorld.y);
        float crack = smoothstep(0.07, 0.0, abs(fbm(vWorld.xz * 2.6 + vec2(0.0, -uTime * 0.04)) - 0.48));
        col += blackbody(0.72) * crack * shore * 2.4;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  root.add(new THREE.Mesh(ground, groundMat))

  const lava = new THREE.Mesh(
    new THREE.CircleGeometry(4.15, 64),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0.4 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float r = length(pos.xy);
          pos.z += sin(r * 3.0 - uTime * 0.6) * 0.04 * (1.0 - r / 4.2);
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
        uniform float uEnergy;
        void main() {
          vec2 p = vWorld.xz * 0.55;
          float flow = fbm(p * 1.6 + vec2(0.0, -uTime * 0.05));
          float n = fbm(p * 2.4 + vec2(sin(uTime * 0.07), -uTime * 0.08));
          float crack = smoothstep(0.2, 0.02, abs(n - 0.5));
          crack = max(crack, smoothstep(0.12, 0.0, abs(fbm(p * 5.5 + vec2(uTime * 0.03, -uTime * 0.1)) - 0.46)));
          float plates = smoothstep(0.35, 0.7, flow);
          float hot = clamp(crack * (0.85 + uEnergy) + plates * 0.18, 0.0, 1.0);
          vec3 crust = vec3(0.012, 0.008, 0.006) * (0.45 + 0.7 * plates);
          vec3 col = mix(crust, blackbody(0.5 + 0.5 * hot), smoothstep(0.05, 0.55, hot));
          col *= mix(0.35, 2.8, hot);
          float rim = smoothstep(0.95, 0.55, vUv.y);
          col += blackbody(0.8) * rim * hot * 0.3;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  )
  lava.rotation.x = -Math.PI / 2
  lava.position.y = lavaY
  root.add(lava)

  function plume(count, kind) {
    const geo = new THREE.BufferGeometry()
    const seeds = new Float32Array(count)
    const seeds2 = new Float32Array(count)
    const sizes = new Float32Array(count)
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      seeds[i] = Math.random()
      seeds2[i] = Math.random()
      sizes[i] = kind === 'fire' ? 6 + Math.random() * 16 : 18 + Math.random() * 40
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('aSeed2', new THREE.BufferAttribute(seeds2, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uBase: { value: lavaY + 0.2 },
        uEnergy: { value: 0.4 },
        uKind: { value: kind === 'fire' ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute float aSeed2;
        attribute float aSize;
        varying float vH;
        varying float vSeed;
        uniform float uTime;
        uniform float uBase;
        uniform float uEnergy;
        uniform float uKind;
        void main() {
          vSeed = aSeed;
          float speed = uKind > 0.5 ? 0.28 : 0.12;
          float life = fract(uTime * speed * (0.75 + aSeed2) + aSeed);
          vH = life;
          float spread = mix(0.12, uKind > 0.5 ? 1.3 : 3.4, life * life) * (0.45 + aSeed2) * (0.75 + uEnergy);
          float ang = aSeed * 6.28318 + life * 1.6 + uTime * 0.12;
          vec3 pos;
          pos.y = uBase + life * (uKind > 0.5 ? 5.5 : 11.0);
          pos.x = cos(ang) * spread + sin(uTime * 0.6 + aSeed * 18.0) * life * 0.35;
          pos.z = sin(ang) * spread + cos(uTime * 0.45 + aSeed * 11.0) * life * 0.35;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = aSize * (uKind > 0.5 ? 1.0 : 1.0 + life);
          gl_PointSize = size * (2.2 / max(0.4, -mv.z));
        }
      `,
      fragmentShader: /* glsl */ `
        ${NOISE}
        varying float vH;
        varying float vSeed;
        uniform float uKind;
        uniform float uEnergy;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, d);
          float fade = smoothstep(0.0, 0.08, vH) * smoothstep(1.0, 0.72, vH);
          if (uKind > 0.5) {
            vec3 col = blackbody(mix(0.4, 1.0, 1.0 - vH));
            float a = soft * fade * (0.55 + uEnergy * 0.4);
            gl_FragColor = vec4(col * a, a);
          } else {
            vec3 hot = vec3(0.42, 0.2, 0.1);
            vec3 ash = vec3(0.1, 0.09, 0.085);
            vec3 col = mix(hot, ash, vH);
            float a = soft * fade * 0.42;
            gl_FragColor = vec4(col, a);
          }
        }
      `,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = kind === 'fire' ? 4 : 3
    return { points, mat }
  }

  const smoke = plume(6500, 'smoke')
  const fire = plume(700, 'fire')
  root.add(smoke.points)
  root.add(fire.points)

  const camR = 6.55
  const camA = 0.9
  const cx = Math.cos(camA) * camR
  const cz = Math.sin(camA) * camR
  const cy = craterHeight(cx, cz) + 0.55

  return {
    id: 'eruption',
    title: 'The eruption',
    place: 'Crater after dark',
    root,
    fov: 50,
    drift: 0.1,
    parallax: 0.2,
    bloom: 0.22,
    threshold: 0.78,
    radius: 0.35,
    exposure: 0.95,
    cameraPos: new THREE.Vector3(cx, cy, cz),
    cameraTarget: new THREE.Vector3(-cx * 0.35, cy - 2.1, -cz * 0.35),
    update(time) {
      const energy = eruptionEnergy(time)
      sky.uniforms.uTime.value = time
      groundMat.uniforms.uTime.value = time
      lava.material.uniforms.uTime.value = time
      lava.material.uniforms.uEnergy.value = energy
      smoke.mat.uniforms.uTime.value = time
      smoke.mat.uniforms.uEnergy.value = energy
      fire.mat.uniforms.uTime.value = time
      fire.mat.uniforms.uEnergy.value = energy
    },
  }
}
