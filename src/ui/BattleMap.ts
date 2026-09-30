import type { GameSession } from '../game/GameSession';
import { BATTLEFIELD } from '../world/battlefield';

/** Full-field tactical map; its orientation uses the same unshaken heading as movement. */
export class BattleMap {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly size = 184;
  private readonly scale = 79 / (BATTLEFIELD.bound * Math.SQRT2);

  constructor(canvas: HTMLCanvasElement) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = this.size * pixelRatio;
    canvas.height = this.size * pixelRatio;
    this.context = canvas.getContext('2d');
    this.context?.scale(pixelRatio, pixelRatio);
  }

  update(session: GameSession, heading: number): void {
    const ctx = this.context;
    if (!ctx) return;
    const center = this.size / 2;
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    const point = (x: number, z: number): [number, number] => [
      center + (-cosine * x + sine * z) * this.scale,
      center + (-sine * x - cosine * z) * this.scale,
    ];
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = '#170e0ce8'; ctx.strokeStyle = '#9d783d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(center, center, 88, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.translate(center, center);
    ctx.transform(-cosine * this.scale, -sine * this.scale, sine * this.scale, -cosine * this.scale, 0, 0);
    ctx.fillStyle = '#39271d'; ctx.strokeStyle = '#876647'; ctx.lineWidth = 1 / this.scale;
    ctx.fillRect(-BATTLEFIELD.bound, -BATTLEFIELD.bound, BATTLEFIELD.bound * 2, BATTLEFIELD.bound * 2);
    ctx.strokeRect(-BATTLEFIELD.bound, -BATTLEFIELD.bound, BATTLEFIELD.bound * 2, BATTLEFIELD.bound * 2);
    ctx.strokeStyle = '#be985366'; ctx.lineWidth = 9;
    // Match the paved corridors rendered by Stage, rather than drawing direct objective lines.
    for (const [ax, az, bx, bz] of [[-65, -40, -65, 70], [65, -35, 65, 70], [-65, 0, 65, 0], [-65, 70, 65, 70], [0, 0, 0, 70]]) {
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
    }
    ctx.fillStyle = '#160d09'; ctx.strokeStyle = '#d4ae704d'; ctx.lineWidth = 0.8 / this.scale;
    for (const obstacle of BATTLEFIELD.obstacles) {
      ctx.fillRect(obstacle.x - obstacle.halfX, obstacle.z - obstacle.halfZ, obstacle.halfX * 2, obstacle.halfZ * 2);
      ctx.strokeRect(obstacle.x - obstacle.halfX, obstacle.z - obstacle.halfZ, obstacle.halfX * 2, obstacle.halfZ * 2);
    }
    ctx.restore();
    for (const enemy of session.enemies) {
      if (enemy.state === 'inactive' || enemy.state === 'dead' || enemy.kind === 'commander') continue;
      const [x, y] = point(enemy.x, enemy.z);
      ctx.fillStyle = enemy.kind === 'elite' ? '#ffb66d' : enemy.kind === 'veteran' ? '#f77d55' : '#e74236';
      ctx.beginPath(); ctx.arc(x, y, enemy.kind === 'elite' ? 2.2 : enemy.kind === 'veteran' ? 1.65 : 1.1, 0, Math.PI * 2); ctx.fill();
    }
    for (const outpost of BATTLEFIELD.outposts) {
      const commander = session.enemies.find((enemy) => enemy.kind === 'commander' && enemy.outpostId === outpost.id);
      const defeated = commander !== undefined && commander.hp <= 0;
      const [x, y] = point(defeated || !commander ? outpost.x : commander.x, defeated || !commander ? outpost.z : commander.z);
      ctx.fillStyle = defeated ? '#536451' : '#c92824'; ctx.strokeStyle = defeated ? '#c2d2a5' : '#ffe19c'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (defeated) { ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x, y + 2); ctx.lineTo(x + 3, y - 2); ctx.stroke(); }
    }
    const [px, py] = point(session.player.x, session.player.z);
    // Rotate the arrow relative to the camera, not relative to world north.
    const fx = Math.sin(session.player.rotation), fz = Math.cos(session.player.rotation);
    const angle = Math.atan2(-cosine * fx + sine * fz, sine * fx + cosine * fz);
    ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
    ctx.fillStyle = '#fff1b4'; ctx.strokeStyle = '#3d210c'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 3); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe6a2';
    ctx.fillText('N', center - sine * 82, center + cosine * 82);
  }
}
