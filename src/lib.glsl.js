export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float hash13(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = m * p * 2.02;
    a *= 0.5;
  }
  return v;
}
float peakShape(float x) {
  float s = sin(x * 0.16) * 0.55 + sin(x * 0.047 + 1.4) * 0.7 + sin(x * 0.41 + 0.6) * 0.22;
  s = max(s, 0.0);
  return s * s * 4.2;
}
vec3 blackbody(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.02, 0.0, 0.0), vec3(0.55, 0.05, 0.0), smoothstep(0.0, 0.22, t));
  c = mix(c, vec3(1.0, 0.24, 0.02), smoothstep(0.18, 0.48, t));
  c = mix(c, vec3(1.0, 0.62, 0.2), smoothstep(0.42, 0.72, t));
  c = mix(c, vec3(1.0, 0.93, 0.78), smoothstep(0.68, 1.0, t));
  return c;
}
vec3 hsv(float h) {
  vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);
  return clamp(abs(k - 3.0) - 1.0, 0.0, 1.0);
}
`

export const SKY = /* glsl */ `
${NOISE}
vec3 auroraColor(vec3 rd, float time) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = rd.x * (4.2 + fi * 1.3) + rd.z * (1.5 + fi * 0.35);
    float fold = sin(x + time * (0.07 + fi * 0.025) + fi * 1.7 + vnoise(rd.xy * 2.4 + fi) * 2.4);
    fold += 0.55 * sin(x * 1.7 - time * 0.04 + rd.y * 1.6 + vnoise(rd.zy * 3.0) * 3.0);
    float curtain = smoothstep(0.15, 0.9, fold * 0.5 + 0.5);
    float rays = pow(0.5 + 0.5 * sin(rd.x * (28.0 + fi * 9.0) + vnoise(rd.xy * 6.0) * 4.0), 2.4);
    rays *= 0.55 + 0.45 * vnoise(vec2(rd.x * 12.0, rd.y * 2.0 - time * 0.03));
    float vert = smoothstep(0.0, 0.08 + fi * 0.02, rd.y) * smoothstep(0.92, 0.42 - fi * 0.06, rd.y);
    float sector = smoothstep(-0.35, 0.25, -rd.z + 0.15 * sin(rd.x * 2.0 + fi));
    float a = curtain * (0.28 + 0.72 * rays) * vert * sector;
    vec3 green = vec3(0.18, 0.95, 0.48);
    vec3 violet = vec3(0.55, 0.28, 0.95);
    vec3 red = vec3(0.85, 0.14, 0.22);
    vec3 c = mix(green, violet, fi * 0.48);
    c = mix(red, c, smoothstep(0.0, 0.14, rd.y));
    sum += c * a * (0.42 - fi * 0.08);
  }
  return sum;
}

vec3 skyColor(vec3 rd, vec3 sun, vec3 moon, float time, float mode, float flash, float auroraAmt) {
  rd = normalize(rd);
  sun = normalize(sun);
  float h = rd.y;
  float mu = dot(rd, sun);
  vec3 col = vec3(0.0);

  if (mode < 0.5) {
    vec3 zenith = vec3(0.10, 0.24, 0.52);
    vec3 midc = vec3(0.42, 0.32, 0.46);
    vec3 hor = vec3(0.98, 0.40, 0.16);
    vec3 ground = vec3(0.42, 0.12, 0.06);
    col = mix(zenith, midc, smoothstep(0.62, 0.0, h));
    col = mix(col, hor, exp(-abs(h) * 3.1));
    col = mix(col, ground, exp(-max(h, 0.0) * 12.0) * 0.8);
    col += vec3(1.0, 0.40, 0.08) * pow(max(mu, 0.0), 5.0) * exp(-max(h, 0.0) * 1.4) * 0.9;
    col += vec3(1.0, 0.78, 0.5) * pow(max(mu, 0.0), 48.0) * 0.55;
  } else if (mode < 1.5) {
    vec3 zenith = vec3(0.006, 0.01, 0.028);
    vec3 hor = vec3(0.025, 0.04, 0.07);
    col = mix(hor, zenith, smoothstep(0.0, 0.5, h));
    col += vec3(0.035, 0.09, 0.045) * exp(-abs(h) * 4.5) * 0.7;
    float band = exp(-pow((h - 0.16 - rd.x * 0.2) * 3.2, 2.0));
    float mw = fbm(vec2(rd.x * 6.0 + rd.z * 2.0, rd.y * 4.0 + 3.0));
    col += vec3(0.20, 0.24, 0.38) * mw * band * 0.6;
    vec3 cell = floor(rd * 460.0);
    float hs = hash13(cell);
    float star = step(0.993, hs);
    float tw = 0.6 + 0.4 * sin(time * (1.2 + hs * 6.0) + hs * 30.0);
    vec3 sc = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.84, 0.68), step(0.997, hs));
    col += sc * star * tw * 1.6 * smoothstep(-0.05, 0.12, h);
    vec3 md = normalize(moon);
    float ang = acos(clamp(dot(rd, md), -1.0, 1.0));
    float disk = smoothstep(0.02, 0.0145, ang);
    float maria = vnoise(rd.xy * 26.0 + 2.0);
    col *= (1.0 - disk);
    col += vec3(0.92, 0.94, 0.86) * disk * (0.72 + 0.28 * maria) * 1.7;
    col += vec3(0.32, 0.38, 0.55) * exp(-ang * 20.0) * 0.45;
  } else if (mode < 2.5) {
    vec3 zenith = vec3(0.035, 0.042, 0.05);
    vec3 hor = vec3(0.15, 0.16, 0.17);
    col = mix(hor, zenith, smoothstep(0.0, 0.55, h));
    col += vec3(0.75, 0.8, 0.85) * flash * exp(-abs(h) * 1.2) * 0.9;
  } else {
    vec3 zenith = vec3(0.26, 0.46, 0.78);
    vec3 hor = vec3(0.70, 0.80, 0.84);
    col = mix(hor, zenith, smoothstep(0.0, 0.5, h));
    col += vec3(1.0, 0.96, 0.88) * pow(max(mu, 0.0), 10.0) * 0.22;
  }

  if (mode < 0.5 || mode > 2.5) {
    float ang = acos(clamp(mu, -1.0, 1.0));
    float disk = smoothstep(0.011, 0.0065, ang);
    float limb = pow(clamp(1.0 - ang / 0.011, 0.0, 1.0), 0.45);
    vec3 sunCol = mode < 0.5 ? vec3(1.0, 0.62, 0.28) : vec3(1.0, 0.98, 0.92);
    col += sunCol * disk * limb * 3.2;
    col += sunCol * exp(-ang * 70.0) * 0.28;
  }

  if (rd.y > 0.0) {
    vec2 cuv = rd.xz / (rd.y + 0.2);
    float n = fbm(cuv * 0.75 + vec2(time * 0.01, time * 0.003));
    float n2 = fbm(cuv * 1.7 - vec2(time * 0.008, 1.2));
    if (mode > 1.5 && mode < 2.5) {
      float d = smoothstep(0.32, 0.66, n);
      vec3 cloud = mix(vec3(0.025, 0.03, 0.034), vec3(0.62, 0.66, 0.7), clamp(flash, 0.0, 1.0));
      cloud += vec3(0.9, 0.95, 1.0) * flash * smoothstep(0.5, 0.85, n2) * 0.45;
      col = mix(col, cloud, d * 0.95);
    } else if (mode < 0.5) {
      float d = smoothstep(0.40, 0.66, n);
      float light = pow(max(mu, 0.0), 1.6);
      vec3 cloud = mix(vec3(0.22, 0.12, 0.09), vec3(1.0, 0.52, 0.28), light);
      cloud = mix(cloud, vec3(1.0, 0.86, 0.62), pow(max(mu, 0.0), 16.0));
      cloud *= mix(1.0, 0.42, smoothstep(0.35, 0.8, n2) * (1.0 - light));
      col = mix(col, cloud, d * 0.88);
    } else if (mode > 2.5) {
      float d = smoothstep(0.56, 0.8, n);
      vec3 cloud = vec3(0.93, 0.95, 0.97) * mix(0.7, 1.0, n2);
      col = mix(col, cloud, d * 0.75);
    }
  }

  if (auroraAmt > 0.5 && mode < 1.5 && mode > 0.5) {
    col += auroraColor(rd, time) * 0.62;
  }

  if (h < 0.0) {
    col *= smoothstep(-0.35, 0.0, h);
  }
  return col;
}
`
