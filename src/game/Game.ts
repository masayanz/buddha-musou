import { ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight, Mesh, MeshStandardMaterial, PCFShadowMap, PMREMGenerator, Scene, Vector2, WebGLRenderer } from 'three';
import type { WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GRAPHICS_CONFIG } from '../config/graphics';
import { InputManager } from '../core/InputManager';
import { HeadingMovement } from '../core/HeadingMovement';
import { Stage } from '../world/Stage';
import { PlayerRenderer } from '../player/PlayerRenderer';
import { EnemyRenderer } from '../enemy/EnemyRenderer';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { EffectManager } from '../effects/EffectManager';
import { CombatAudio } from '../effects/CombatAudio';
import { GameUI } from '../ui/GameUI';
import type { PerformanceStats } from '../ui/GameUI';
import { GameSession } from './GameSession';
import { GameLoop } from './GameLoop';

/** 入力・純粋な戦闘ロジック・描画を接続する。 */
export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly environment: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly camera = new ThirdPersonCamera();
  private readonly movement = new HeadingMovement();
  private readonly sunlight = new DirectionalLight(0xffd49a, 3.1);
  private readonly session = new GameSession();
  private readonly stage = new Stage();
  private readonly hero = new PlayerRenderer();
  private readonly enemies = new EnemyRenderer();
  private readonly effects = new EffectManager();
  private readonly audio = new CombatAudio();
  private readonly input: InputManager;
  private readonly ui: GameUI;
  private readonly loop: GameLoop;
  private readonly command = { moveX: 0, moveZ: 0, attack: false, strong: false, skill: false, dodge: false };
  private readonly stats: PerformanceStats = { fps: 0, drawCalls: 0, triangles: 0, geometries: 0 };
  private uiTimer = 0;
  private frames = 0;
  private statsTime = performance.now();
  private disposed = false;
  private visualTime = 0;
  private hitStop = 0;
  private slowMotion = 0;
  private lastImpactAttack = -1;
  private lastDeathAttack = -1;
  private attackHitCount = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly root: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    const environmentScene = new RoomEnvironment();
    const environmentGenerator = new PMREMGenerator(this.renderer);
    this.environment = environmentGenerator.fromScene(environmentScene, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.32;
    environmentScene.dispose(); environmentGenerator.dispose();
    this.renderer.info.autoReset = false;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.4, 0.45, 1.35));
    this.composer.addPass(new OutputPass());
    this.renderer.domElement.setAttribute('aria-label', '仏像と落武者が戦う荒廃した寺院');
    this.renderer.domElement.setAttribute('role', 'img');
    this.scene.background = new Color(GRAPHICS_CONFIG.background);
    this.scene.fog = new Fog(GRAPHICS_CONFIG.background, GRAPHICS_CONFIG.fogNear, GRAPHICS_CONFIG.fogFar);
    const sunlight = this.sunlight;
    sunlight.position.set(-12, 22, 10);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 0.5, far: 100 });
    sunlight.shadow.bias = -0.0004;
    sunlight.shadow.normalBias = 0.06;
    const rimLight = new DirectionalLight(0xff6730, 2.2);
    rimLight.position.set(8, 9, -15);
    this.scene.add(new HemisphereLight(0xe7d3b6, 0x28181d, 1.1), sunlight, sunlight.target, rimLight, this.stage, this.hero, this.enemies, this.effects);
    for (const object of [this.stage, this.hero, this.enemies]) object.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.castShadow = object !== this.stage;
        child.receiveShadow = true;
      }
    });
    this.camera.follow(0, 0, 0, true);
    this.input = new InputManager(() => this.session.state === 'playing');
    const uiRoot = root.querySelector<HTMLElement>('#ui-root');
    if (!uiRoot) throw new Error('UIの表示領域がありません。');
    this.ui = new GameUI(uiRoot, {
      start: this.newBattle,
      pause: () => this.pause(),
      resume: () => this.resume(),
      title: () => this.returnToTitle(),
      toggleSound: () => this.ui.setSoundEnabled(this.audio.toggle()),
    });
    this.loop = new GameLoop(this.update, this.render);
    root.prepend(this.renderer.domElement);
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.updateVisuals(0);
    this.ui.update(this.session, this.stats, this.camera.heading);
  }

  start(): void {
    if (this.disposed) return;
    this.render();
    if (!document.hidden) this.loop.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.input.dispose();
    this.ui.dispose();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stage.dispose();
    this.hero.dispose();
    this.enemies.dispose();
    this.effects.dispose();
    this.audio.dispose();
    this.scene.traverse((child) => { if (child instanceof DirectionalLight) child.shadow.dispose(); });
    this.scene.clear();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly newBattle = (): void => {
    this.audio.unlock();
    this.session.start();
    this.resetVisuals();
    this.ui.update(this.session, this.stats, this.camera.heading);
  };

  private resetVisuals(): void {
    this.input.clear();
    this.movement.reset();
    this.effects.reset();
    this.hero.reset();
    this.visualTime = 0;
    this.hitStop = 0; this.slowMotion = 0; this.lastImpactAttack = -1; this.lastDeathAttack = -1; this.attackHitCount = 0;
    this.camera.follow(this.session.player.x, this.session.player.z, 0, true, this.session.player.rotation);
    this.updateVisuals(0);
  }

  private pause(): void {
    this.session.pause();
    this.audio.pause();
    this.input.clear();
    this.movement.reset();
    this.ui.update(this.session, this.stats, this.camera.heading);
  }

  private resume(): void {
    this.session.resume();
    this.audio.unlock();
    this.input.clear();
    this.movement.reset();
    this.ui.update(this.session, this.stats, this.camera.heading);
  }

  private returnToTitle(): void {
    this.audio.pause();
    this.session.returnToTitle();
    this.resetVisuals();
    this.ui.update(this.session, this.stats, this.camera.heading);
  }

  private readonly update = (dt: number): void => {
    if (this.input.consume('F3')) this.ui.toggleDebug();
    if (this.input.consume('KeyM') && this.session.state === 'playing') this.ui.setSoundEnabled(this.audio.toggle());
    if (this.input.consume('Escape')) {
      if (this.session.state === 'playing') this.pause();
      else if (this.session.state === 'paused') this.resume();
    }
    if (this.input.consume('Enter') && (this.session.state === 'title' || this.session.state === 'result')) this.newBattle();
    if (this.session.state === 'playing') {
      const orbit = Number(this.input.isDown('KeyQ')) - Number(this.input.isDown('KeyE'));
      if (orbit) { this.camera.orbit(orbit * dt * 1.8); this.movement.reset(); }
      if (this.input.consume('KeyC')) { this.camera.recenter(this.session.player.rotation); this.movement.reset(); }
    }
    const frozen = this.session.state === 'playing' && this.hitStop > 0;
    if (this.session.state === 'playing') {
      this.hitStop = Math.max(0, this.hitStop - dt);
      this.slowMotion = Math.max(0, this.slowMotion - dt);
    }
    const simulationDt = frozen ? 0 : dt * (this.slowMotion > 0 ? 0.38 : 1);
    if (!frozen) {
      const right = Number(this.input.isDown('KeyD', 'ArrowRight')) - Number(this.input.isDown('KeyA', 'ArrowLeft'));
      const back = Number(this.input.isDown('KeyS', 'ArrowDown')) - Number(this.input.isDown('KeyW', 'ArrowUp'));
      const direction = this.movement.update(right, back, this.camera.heading);
      this.command.moveX = direction.x;
      this.command.moveZ = direction.z;
      this.command.attack = this.input.consume('KeyJ') || this.input.isDown('KeyJ');
      this.command.strong = this.input.consume('KeyK');
      this.command.skill = this.input.consume('KeyL');
      this.command.dodge = this.input.consume('Space');
      this.session.update(simulationDt, this.command);
      this.input.endFrame();
    }

    let hits = 0;
    let deaths = 0;
    let impactKind = this.session.player.attackKind ?? 'normal';
    for (const event of this.session.events) {
      if (event.kind === 'playerHit') {
        if (!this.reducedMotion) this.camera.shake(0.12);
        this.audio.playerHit();
      } else if (event.kind === 'dodge') this.audio.dodge();
      else if (event.kind === 'powerReady') this.audio.powerReady();
      else this.effects.emit(event.kind, event.x, event.z, event.rotation, event.attackStep);
      if (event.kind === 'hit') { hits++; impactKind = event.attackKind ?? impactKind; }
      if (event.kind === 'death') deaths++;
      if (event.kind === 'slash' || event.kind === 'strong' || event.kind === 'skill') this.audio.swing(event.kind === 'slash' ? 'normal' : event.kind, event.attackStep);
    }
    if (hits > 0) {
      const firstHit = this.lastImpactAttack !== this.session.attackInstanceId;
      this.attackHitCount = firstHit ? hits : this.attackHitCount + hits;
      this.ui.combatFeedback(impactKind, this.attackHitCount, firstHit);
      if (firstHit) {
        this.audio.impact(impactKind, hits);
        this.lastImpactAttack = this.session.attackInstanceId;
        this.hitStop = impactKind === 'skill' ? 0.085 : impactKind === 'strong' ? 0.055 : 0.032;
        if (impactKind === 'skill') this.slowMotion = 0.38;
        if (!this.reducedMotion) this.camera.impact(impactKind === 'skill' ? 1 : impactKind === 'strong' ? 0.65 : 0.3);
      }
    }
    if (deaths > 0 && this.lastDeathAttack !== this.session.attackInstanceId) {
      this.audio.enemyDeath(deaths);
      this.lastDeathAttack = this.session.attackInstanceId;
    }
    this.session.events.length = 0;
    if (this.session.state !== 'paused') {
      this.visualTime += simulationDt;
      this.updateVisuals(simulationDt, dt);
    }
    this.uiTimer += dt;
    if (this.uiTimer >= 0.1) {
      this.uiTimer = 0;
      this.ui.update(this.session, this.stats, this.camera.heading);
    }
  };

  private updateVisuals(dt: number, realDt = dt): void {
    this.sunlight.position.set(this.session.player.x - 12, 22, this.session.player.z + 10);
    this.sunlight.target.position.set(this.session.player.x, 0, this.session.player.z);
    this.stage.update(dt, this.visualTime);
    this.hero.update(dt, this.session.player);
    this.enemies.update(this.session.enemies, this.visualTime, this.camera.heading, this.camera.position);
    this.effects.update(realDt, this.camera.heading);
    if (this.session.state === 'title') {
      this.hero.rotation.y = 0.4;
      this.camera.position.set(4.8, 3.8, 7.4);
      this.camera.lookAt(-1.9, 1.85, 0);
    } else {
      const travelHeading = this.session.state === 'playing'
        ? this.session.player.dodging ? this.session.player.rotation
          : this.session.player.moving && Math.hypot(this.command.moveX, this.command.moveZ) > 0
            ? Math.atan2(this.command.moveX, this.command.moveZ) : undefined
        : undefined;
      this.camera.follow(this.session.player.x, this.session.player.z, realDt, false, travelHeading);
    }
  }

  private readonly render = (): void => {
    this.renderer.info.reset();
    this.composer.render();
    this.frames++;
    const now = performance.now();
    if (now - this.statsTime >= 1000) {
      this.stats.fps = Math.round(this.frames * 1000 / (now - this.statsTime));
      this.stats.drawCalls = this.renderer.info.render.calls;
      this.stats.triangles = this.renderer.info.render.triangles;
      this.stats.geometries = this.renderer.info.memory.geometries;
      this.frames = 0;
      this.statsTime = now;
    }
  };

  private readonly resize = (): void => {
    const width = Math.max(this.root.clientWidth, 1);
    const height = Math.max(this.root.clientHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GRAPHICS_CONFIG.maxPixelRatio));
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private readonly onBlur = (): void => {
    if (this.session.state === 'playing') this.pause();
  };

  private readonly onVisibilityChange = (): void => {
    this.input.clear();
    if (document.hidden) {
      this.onBlur();
      this.loop.stop();
    } else {
      this.frames = 0;
      this.statsTime = performance.now();
      this.loop.start();
    }
  };
}
