import { describe, expect, it } from 'vitest';
import { HeadingMovement } from '../src/core/HeadingMovement';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera';
import { Vector3 } from 'three';

describe('heading-up movement', () => {
  it.each([
    [0, 0, -1, 0, 1], [0, 1, 0, -1, 0],
    [Math.PI / 2, 0, -1, 1, 0], [Math.PI / 2, 1, 0, 0, 1],
    [Math.PI, 0, -1, 0, -1], [Math.PI, 1, 0, 1, 0],
    [-Math.PI / 2, 0, -1, -1, 0], [-Math.PI / 2, 1, 0, 0, -1],
  ])('maps screen input to world direction at heading %s', (heading, right, back, x, z) => {
    const movement = new HeadingMovement();
    const actual = movement.update(right, back, heading);
    expect(actual.x).toBeCloseTo(x); expect(actual.z).toBeCloseTo(z);
  });

  it('holds a straight world course as the camera turns, then rebases on changed or released input', () => {
    const movement = new HeadingMovement();
    movement.update(1, 0, Math.PI);
    for (let heading = Math.PI; heading >= 0; heading -= 0.1) {
      const direction = movement.update(1, 0, heading);
      expect(direction.x).toBeCloseTo(1); expect(direction.z).toBeCloseTo(0);
    }
    expect(movement.update(0, -1, Math.PI / 2).x).toBeCloseTo(1);
    movement.update(0, 0, 0);
    expect(movement.update(1, 0, Math.PI / 2).z).toBeCloseTo(1);
    movement.reset();
    expect(movement.update(1, 0, Math.PI).x).toBeCloseTo(1);
  });

  it('normalizes diagonals and returns finite zero after release', () => {
    const movement = new HeadingMovement();
    const diagonal = movement.update(1, -1, Math.PI);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
    expect(movement.update(0, 0, 0)).toEqual({ x: 0, z: 0 });
  });
});

describe('heading-up camera', () => {
  it('pulls the camera in before a temple wall instead of hiding the player behind it', () => {
    const camera = new ThirdPersonCamera();
    camera.follow(0, -31, 0, true, 0);
    expect(camera.position.z).toBeGreaterThan(-34);
    expect(camera.position.z).toBeLessThan(-31);
  });

  it('never pushes a minimum boom through a wall when the player hugs it', () => {
    const camera = new ThirdPersonCamera();
    camera.follow(0, -33.4, 0, true, 0);
    expect(camera.position.z).toBeGreaterThan(-34);
    expect(camera.position.y).toBeGreaterThan(6);
    camera.shake(0.3);
    for (let frame = 0; frame < 60; frame++) {
      camera.orbit(0.01);
      camera.follow(0, -33.4, 1 / 60);
      expect(camera.position.z).toBeGreaterThan(-34);
    }
  });

  it('places the camera behind each cardinal heading, with forward above the player on screen', () => {
    const camera = new ThirdPersonCamera();
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      camera.follow(0, 0, 0, true, heading);
      const forward = new Vector3(Math.sin(heading), 0, Math.cos(heading));
      expect(camera.position.dot(forward)).toBeLessThan(-9);
      camera.updateMatrixWorld(true);
      const origin = new Vector3(0, 0, 0).project(camera);
      const ahead = forward.multiplyScalar(4).project(camera);
      expect(ahead.y).toBeGreaterThan(origin.y);
    }
  });

  it('takes the short route across the angle seam and shake never steers movement', () => {
    const camera = new ThirdPersonCamera();
    camera.follow(0, 0, 0, true, 179 * Math.PI / 180);
    camera.follow(0, 0, 1 / 60, false, -179 * Math.PI / 180);
    expect(camera.heading).toBeGreaterThan(179 * Math.PI / 180);
    const heading = camera.heading;
    camera.shake(0.3); camera.follow(0, 0, 0);
    expect(camera.heading).toBe(heading);
  });
});
