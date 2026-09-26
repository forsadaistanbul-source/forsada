// Shared by both passes: a full-screen quad that simply forwards its UVs.
export const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Simulation pass (ping-pong). Reads last frame's mask, fades it, then draws
// a continuous capsule from uPrevMouse to uMouse so fast strokes stay unbroken.
export const trailFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrevTrail;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform vec2 uResolution;
  uniform float uDecay;
  uniform float uDecayFloor;
  uniform float uIsMoving;
  uniform float uLineWidth;
  uniform float uIntensity;

  varying vec2 vUv;

  // Distance from p to the closest point on segment ab.
  float distToSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    float prev = texture2D(uPrevTrail, vUv).r;
    prev = max(prev * uDecay - uDecayFloor, 0.0);

    // Work in aspect-corrected space so the stroke is round, not stretched.
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    float d = distToSegment(vUv * aspect, uPrevMouse * aspect, uMouse * aspect);

    float stroke = 1.0 - smoothstep(0.0, uLineWidth, d);
    stroke *= stroke;

    float value = min(prev + stroke * uIntensity * uIsMoving, 1.0);
    gl_FragColor = vec4(value, value, value, 1.0);
  }
`;

// Composite pass. Day image on top, evening table underneath, revealed where
// the trail mask crosses the threshold, with a warm halo on the fringe.
export const displayFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uTrail;
  uniform sampler2D uTopTexture;
  uniform sampler2D uBottomTexture;
  uniform vec2 uResolution;
  uniform vec2 uTopTextureSize;
  uniform vec2 uBottomTextureSize;
  uniform float uDpr;
  uniform float uRevealThreshold;
  uniform float uEdgeWidthBase;
  uniform float uHaloUpperMul;
  uniform float uHaloMixStrength;
  uniform vec3 uHaloColor;

  varying vec2 vUv;

  // CSS object-fit: cover, expressed in UV space.
  vec2 getCoverUV(vec2 uv, vec2 texSize) {
    vec2 ratio = uResolution / texSize;
    float scale = max(ratio.x, ratio.y);
    vec2 scaled = texSize * scale;
    vec2 offset = (uResolution - scaled) * 0.5;
    return (uv * uResolution - offset) / scaled;
  }

  void main() {
    float trail = texture2D(uTrail, vUv).r;

    vec3 topColor = texture2D(uTopTexture, getCoverUV(vUv, uTopTextureSize)).rgb;
    vec3 bottomColor = texture2D(uBottomTexture, getCoverUV(vUv, uBottomTextureSize)).rgb;

    float edge = uEdgeWidthBase / uDpr;
    float t = smoothstep(uRevealThreshold, uRevealThreshold + edge, trail);

    // Rises with the mask, peaks right before the reveal, dies once t -> 1.
    float halo = smoothstep(0.0, uRevealThreshold * uHaloUpperMul, trail) * (1.0 - t);
    vec3 tintedTop = mix(topColor, uHaloColor, halo * uHaloMixStrength);

    gl_FragColor = vec4(mix(tintedTop, bottomColor, t), 1.0);
  }
`;
