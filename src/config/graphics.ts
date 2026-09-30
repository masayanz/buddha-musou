export const GRAPHICS_CONFIG = {
  maxPixelRatio: 1.5,
  background: 0x2d211b,
  fogNear: 36,
  fogFar: 145,
  camera: { fov: 58, near: 0.1, far: 220 },
} as const;

export const LOOP_CONFIG = {
  fixedDt: 1 / 60,
  maxFrameDelta: 0.1,
} as const;
