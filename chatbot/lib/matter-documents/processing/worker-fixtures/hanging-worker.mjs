const sleeper = new Int32Array(new SharedArrayBuffer(4));
while (true) {
  Atomics.wait(sleeper, 0, 0, 60_000);
}
