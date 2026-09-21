// 입력마다 프레임을 한 칸 넘기고 한 번 눌렸다가 복원합니다.
export class Motion {
  private start = -Infinity;
  private step = 0;
  trigger(now: number) {
    this.start = now;
    this.step++;
  }
  stop() {
    this.start = -Infinity;
    this.step = 0;
  }
  sample(now: number, fps: number, count: number, reduced: boolean) {
    const progress = Math.min(
      1,
      Math.max(0, ((now - this.start) * fps) / 1000),
    );
    const pressure = reduced ? 0 : (1 - progress) ** 3;
    return {
      frame: this.step % Math.max(1, count),
      y: 0,
      scaleX: 1 + pressure * 0.06,
      scaleY: 1 - pressure * 0.12,
      active: progress < 1,
    };
  }
}
