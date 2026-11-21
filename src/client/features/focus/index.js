// Feature methods use the shared application context; no browser globals are added.
export function register(app) {
  app.timerCard = function timerCard() {
    return `<section class="card timer-card"><div class="card-title"><h2>A little focus goes a long way.</h2>${app.icon("clock")}</div><div class="label">FOCUS TIMER</div><div class="timer-display" id="timerDisplay">25:00</div><p>One topic. One session. No rush.</p><div class="timer-controls"><button class="primary-btn" data-action="timer" id="timerButton">${app.icon(app.s.timer.running ? "pause" : "play")}${app.s.timer.running ? "Pause session" : "Start focus session"}</button><button class="icon-btn" data-action="timer-reset" aria-label="Reset timer">${app.icon("reset")}</button></div></section>`;
  };

  app.updateTimer = function updateTimer() {
    let remain = app.s.timer.running
      ? Math.max(0, Math.ceil((app.s.timer.end - Date.now()) / 1000))
      : app.s.timer.remaining;
    if (app.s.timer.running && remain <= 0) {
      app.s.timer = { remaining: 0, running: false, end: 0 };
      app.save();
      app.toast("Focus session complete. Take a short break.");
      const btn = document.getElementById("timerButton");
      if (btn) btn.innerHTML = app.icon("play") + "Start another session";
    }
    const e = document.getElementById("timerDisplay");
    if (e)
      e.textContent = `${String(Math.floor(remain / 60)).padStart(2, "0")}:${String(remain % 60).padStart(2, "0")}`;
  };
}
