const wheelCanvas = document.querySelector("#wheelCanvas");
const ctx = wheelCanvas.getContext("2d");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#nameInput");
const nameList = document.querySelector("#nameList");
const emptyState = document.querySelector("#emptyState");
const spinButton = document.querySelector("#spinButton");
const result = document.querySelector("#result");
const addButton = document.querySelector(".add-button");

const palette = [
  "#0d6b78",
  "#e05a47",
  "#f6c445",
  "#4d8f5b",
  "#9d4edd",
  "#ee8b2c",
  "#3867d6",
  "#c23b62",
];

const names = [];
let rotation = 0;
let spinning = false;
let loading = true;
let audioContext = null;

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function playTone(frequency, duration, type = "square", volume = 0.035) {
  const soundContext = getAudioContext();

  if (!soundContext) {
    return;
  }

  const oscillator = soundContext.createOscillator();
  const gain = soundContext.createGain();
  const startAt = soundContext.currentTime;
  const endAt = startAt + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, endAt);

  oscillator.connect(gain);
  gain.connect(soundContext.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt);
}

function playWinSound() {
  [523, 659, 784].forEach((frequency, index) => {
    window.setTimeout(() => playTone(frequency, 0.14, "sine", 0.055), index * 105);
  });
}

function sanitizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function randomIndex(max) {
  if (window.crypto?.getRandomValues) {
    const range = 0x100000000;
    const limit = range - (range % max);
    const values = new Uint32Array(1);

    do {
      window.crypto.getRandomValues(values);
    } while (values[0] >= limit);

    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function truncateText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }

  return `${shortened}...`;
}

function drawEmptyWheel(center, radius) {
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#f8efe0";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#202020";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center, center, radius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#202020";
  ctx.fill();
}

function drawWheel() {
  const size = wheelCanvas.width;
  const center = size / 2;
  const radius = size * 0.44;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(0, 0);

  if (names.length === 0) {
    drawEmptyWheel(center, radius);
    ctx.restore();
    return;
  }

  const slice = (Math.PI * 2) / names.length;
  const fontSize = Math.max(18, Math.min(32, 44 - names.length * 1.2));

  names.forEach((name, index) => {
    const start = rotation + index * slice - Math.PI / 2;
    const end = start + slice;
    const mid = start + slice / 2;

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = palette[index % palette.length];
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.stroke();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;

    const maxTextWidth = radius * 0.62;
    ctx.fillText(truncateText(name.value, maxTextWidth), radius * 0.88, 0);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#202020";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center, center, radius * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#202020";
  ctx.stroke();

  ctx.restore();
}

function renderNames() {
  nameList.innerHTML = "";
  emptyState.hidden = names.length > 0;
  nameInput.disabled = loading || spinning;
  addButton.disabled = loading || spinning;
  spinButton.disabled = loading || names.length === 0 || spinning;
  spinButton.textContent = spinning ? "..." : "Spin";

  names.forEach((name) => {
    const item = document.createElement("li");
    item.className = "name-item";

    const text = document.createElement("span");
    text.className = "name-text";
    text.textContent = name.value;
    text.title = name.value;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.textContent = "x";
    removeButton.setAttribute("aria-label", `Remove ${name.value}`);
    removeButton.disabled = loading || spinning;
    removeButton.addEventListener("click", () => removeName(name.id));

    item.append(text, removeButton);
    nameList.append(item);
  });

  if (loading) {
    result.textContent = "Loading";
  }

  drawWheel();
}

async function fetchNames() {
  const response = await fetch("/api/names", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Could not load names");
  }

  return response.json();
}

async function createName(value) {
  const response = await fetch("/api/names", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    throw new Error("Could not add name");
  }

  return response.json();
}

async function deleteName(id) {
  const response = await fetch(`/api/names/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Could not remove name");
  }
}

async function loadNames() {
  loading = true;
  renderNames();

  try {
    const savedNames = await fetchNames();
    names.splice(0, names.length, ...savedNames);
    result.textContent = names.length ? `${names.length} names` : "Add names";
  } catch {
    result.textContent = "Start server";
  } finally {
    loading = false;
    renderNames();
  }
}

async function addName(value) {
  const cleanName = sanitizeName(value);

  if (!cleanName) {
    return;
  }

  loading = true;
  renderNames();

  try {
    const name = await createName(cleanName);
    names.push(name);
    nameInput.value = "";
    result.textContent = names.length === 1 ? cleanName : `${names.length} names`;
  } catch {
    result.textContent = "Could not save";
  } finally {
    loading = false;
    renderNames();
  }
}

async function removeName(id) {
  if (loading || spinning) {
    return;
  }

  const index = names.findIndex((name) => name.id === id);
  if (index === -1) {
    return;
  }

  loading = true;
  renderNames();

  const [removed] = names.splice(index, 1);

  try {
    await deleteName(id);
    result.textContent = names.length ? `${removed.value} removed` : "Add names";
  } catch {
    names.splice(index, 0, removed);
    result.textContent = "Could not delete";
  } finally {
    loading = false;
    renderNames();
  }
}

function spinWheel() {
  if (loading || spinning || names.length === 0) {
    return;
  }

  const winnerIndex = randomIndex(names.length);
  const slice = (Math.PI * 2) / names.length;
  const desiredRotation = -(winnerIndex + 0.5) * slice;
  const fullTurns = 5 + randomIndex(3);
  const startRotation = rotation;
  const endRotation =
    startRotation +
    fullTurns * Math.PI * 2 +
    positiveModulo(desiredRotation - startRotation, Math.PI * 2);
  const startedAt = performance.now();
  const duration = 4200;

  spinning = true;
  spinButton.disabled = true;
  spinButton.textContent = "...";
  result.textContent = "Spinning";
  getAudioContext();

  let lastTickAt = 0;

  function animate(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = easeOutCubic(progress);
    const tickDelay = 65 + progress * 150;

    if (now - lastTickAt >= tickDelay) {
      playTone(520 - progress * 210, 0.035, "square", 0.026);
      lastTickAt = now;
    }

    rotation = startRotation + (endRotation - startRotation) * eased;
    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
      return;
    }

    rotation = positiveModulo(desiredRotation, Math.PI * 2);
    spinning = false;
    result.textContent = names[winnerIndex].value;
    spinButton.disabled = names.length === 0;
    spinButton.textContent = "Spin";
    playWinSound();
    drawWheel();
  }

  requestAnimationFrame(animate);
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addName(nameInput.value);
  nameInput.focus();
});

spinButton.addEventListener("click", spinWheel);

loadNames();
