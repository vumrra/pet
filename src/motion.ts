// Independent frame clock and complete 360 ms physical bounce cycles.
export class Motion {
  private start = -Infinity;
  private until = -Infinity;
  trigger(now: number) {
    if (now >= this.until) this.start = now;
    this.until = this.start + Math.ceil((now - this.start + 540) / 360) * 360;
  }
  stop() {
    this.start = this.until = -Infinity;
  }
  sample(now: number, fps: number, count: number, reduced: boolean) {
    if (now >= this.until)
      return { frame: 0, y: 0, scaleX: 1, scaleY: 1, active: false };
    const elapsed = Math.max(0, now - this.start),
      phase = (elapsed % 360) / 360;
    const contact = Math.max(0, 1 - phase * 10);
    return {
      frame: Math.floor((elapsed * fps) / 1000) % Math.max(1, count),
      y: reduced ? 0 : -12 * 4 * phase * (1 - phase),
      scaleX: reduced ? 1 : 1 + contact * 0.035,
      scaleY: reduced ? 1 : 1 - contact * 0.035,
      active: true,
    };
  }
}
