import * as THREE from 'three'
import { NOISE } from './lib.glsl.js'
import { fbm } from './noise.js'

const vertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragment = /* glsl */ `
${NOISE}
varying vec3 vWorld;
varying vec3 vNormal;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uTint;
uniform float uWet;
void main() {
  vec3 n = normalize(vNormal);
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  float h = fbm(vWorld.xz * 2.2 + vWorld.y);
  n = normalize(n - dFdx(vWorld) * dFdx(h) * 0.8 - dFdy(vWorld) * dFdy(h) * 0.8);
  float grain = fbm(vWorld.xz * 2.2 + vWorld.xy);
  vec3 albedo = mix(vec3(0.14, 0.12, 0.1), vec3(0.30, 0.26, 0.22), grain);
  albedo *= uTint;
  float cavity = smoothstep(0.62, 0.28, fbm(vWorld.xz * 0.9 + 4.0));
  albedo *= mix(1.0, 0.62, cavity);
  albedo *= mix(1.0, 0.62, uWet);
  vec3 sun = normalize(uSunDir);
  float ndl = max(dot(n, sun), 0.0);
  float wrap = ndl * 0.72 + 0.28;
  vec3 hemi = mix(vec3(0.1, 0.08, 0.06), uSunColor * 0.35, n.y * 0.5 + 0.5);
  vec3 col = albedo * (hemi + uSunColor * wrap * 1.25);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 halfV = normalize(sun + view);
  float spec = pow(max(dot(n, halfV), 0.0), mix(18.0, 90.0, uWet));
  float chip = step(0.62, vnoise(vWorld.xz * 12.0 + vWorld.y));
  col += uSunColor * spec * (0.12 + uWet * 0.7) * (0.35 + 0.65 * chip);
  gl_FragColor = vec4(col, 1.0);
}
`

const materials = new Map()

function materialFor(key, uniforms) {
  if (materials.has(key)) return materials.get(key)
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
  })
  materials.set(key, mat)
  return mat
}

export function rockGeometry(seed, radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 3)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    const j = fbm(v.x * 2.1 + seed, v.y * 2.1 + v.z + seed * 0.17)
    const s = radius * (0.72 + j * 0.58)
    v.multiplyScalar(s)
    v.y *= 0.74
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

export function addRock(parent, { x, groundY, z, radius, seed, sunDir, sunColor, wet, tint, key }) {
  const uniforms = {
    uSunDir: { value: sunDir },
    uSunColor: { value: sunColor },
    uTint: { value: tint },
    uWet: { value: wet },
  }
  const mesh = new THREE.Mesh(rockGeometry(seed, radius), materialFor(key, uniforms))
  mesh.position.set(x, groundY + radius * 0.28, z)
  mesh.rotation.y = seed * 6.28
  parent.add(mesh)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.25, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(x, groundY + 0.035, z)
  parent.add(shadow)
  return mesh
}
