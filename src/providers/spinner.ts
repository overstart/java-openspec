// 共享 spinner 单例，支持并行调用计数
let spinnerState: { count: number; msg: string; interval: ReturnType<typeof setInterval> | null } = {
  count: 0,
  msg: "",
  interval: null,
};

const FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

export function startSpinner(msg: string): (newMsg?: string) => void {
  spinnerState.count++;
  if (spinnerState.count === 1) {
    spinnerState.msg = msg;
    let i = 0;
    spinnerState.interval = setInterval(() => {
      process.stdout.write(`\r${FRAMES[i]} ${spinnerState.msg}`);
      i = (i + 1) % FRAMES.length;
    }, 80);
  }
  return (newMsg?: string) => {
    if (newMsg !== undefined && spinnerState.interval) {
      spinnerState.msg = newMsg;
    } else {
      spinnerState.count = Math.max(0, spinnerState.count - 1);
      if (spinnerState.count === 0 && spinnerState.interval) {
        clearInterval(spinnerState.interval);
        spinnerState.interval = null;
        process.stdout.write(`\r${" ".repeat(spinnerState.msg.length + 2)}\r`);
      }
    }
  };
}
