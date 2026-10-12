import * as THREE from 'three'
import { SKY } from './lib.glsl.js'

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const skyFragment = /* glsl */ `
${SKY}
varying vec3 vDir;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uFlash;
uniform float uMode;
uniform float uAurora;
uniform vec3 uLift;
void main() {
  vec3 rd = normalize(vDir);
  vec3 col = skyColor(rd, uSun, uMoon, uTime, uMode, uFlash, uAurora);
  col += uLift * exp(-max(rd.y, 0.0) * 2.8);
  gl_FragColor = vec4(col, 1.0);
}
`

export function createSky({ mode, sun, moon = new THREE.Vector3(0.2, -0.4, 0.1), aurora = 0, lift = new THREE.Vector3() }) {
  const uniforms = {
    uTime: { value: 0 },
    uSun: { value: sun.clone().normalize() },
    uMoon: { value: moon.clone().normalize() },
    uFlash: { value: 0 },
    uMode: { value: mode },
    uAurora: { value: aurora },
    uLift: { value: lift.clone() },
  }
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(680, 40, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
    }),
  )
  mesh.frustumCulled = false
  mesh.renderOrder = -20
  return { mesh, uniforms }
}
