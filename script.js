const ROWS = 3;
const COLS = 5;
const PUZZLES = [
  {
    id: "train",
    label: "でんしゃ",
    title: "でんしゃ",
    image: "assets/train-driver-view.png",
  },
  {
    id: "plane",
    label: "ひこうき",
    title: "ひこうき",
    image: "assets/plane-cockpit-view.png",
  },
  {
    id: "bus",
    label: "バス",
    title: "バス",
    image: "assets/bus-driver-view.png",
  },
  {
    id: "sample",
    label: "おためし",
    title: "できるかな？",
    image: "assets/puzzle-image.svg",
    fallbackOnly: true,
  },
];

const board = document.querySelector("#board");
const tray = document.querySelector("#tray");
const puzzlePicker = document.querySelector("#puzzlePicker");
const gameTitle = document.querySelector("#gameTitle");
const resetButton = document.querySelector("#resetButton");
const againButton = document.querySelector("#againButton");
const finishScreen = document.querySelector("#finishScreen");
const confettiCanvas = document.querySelector("#confettiCanvas");
const confettiContext = confettiCanvas.getContext("2d");

let availablePuzzles = [];
let currentPuzzle = PUZZLES[PUZZLES.length - 1];
let activeDrag = null;
let confettiPieces = [];
let confettiFrame = null;

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(path);
    image.onerror = reject;
    image.src = `${path}?v=${Date.now()}`;
  });
}

async function chooseAvailablePuzzles() {
  const loaded = [];
  for (const puzzle of PUZZLES) {
    try {
      await loadImage(puzzle.image);
      loaded.push(puzzle);
    } catch {
      continue;
    }
  }

  const realPuzzles = loaded.filter((puzzle) => !puzzle.fallbackOnly);
  return realPuzzles.length ? realPuzzles : loaded;
}

function createPuzzlePicker() {
  puzzlePicker.innerHTML = "";

  for (const puzzle of availablePuzzles) {
    const button = document.createElement("button");
    button.className = "puzzle-choice";
    button.type = "button";
    button.dataset.puzzleId = puzzle.id;
    button.textContent = puzzle.label;
    button.addEventListener("click", () => selectPuzzle(puzzle.id));
    puzzlePicker.append(button);
  }
}

function selectPuzzle(puzzleId) {
  const nextPuzzle = availablePuzzles.find((puzzle) => puzzle.id === puzzleId);
  if (!nextPuzzle) return;

  currentPuzzle = nextPuzzle;
  gameTitle.textContent = currentPuzzle.title;

  for (const button of puzzlePicker.querySelectorAll(".puzzle-choice")) {
    button.classList.toggle("is-selected", button.dataset.puzzleId === currentPuzzle.id);
  }

  resetGame();
}

function createSlots() {
  board.innerHTML = "";
  for (let index = 0; index < ROWS * COLS; index += 1) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = String(index);
    board.append(slot);
  }
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function backgroundPosition(col, row) {
  const x = COLS === 1 ? 0 : (col / (COLS - 1)) * 100;
  const y = ROWS === 1 ? 0 : (row / (ROWS - 1)) * 100;
  return [`${x}%`, `${y}%`];
}

function createPiece(index) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const [x, y] = backgroundPosition(col, row);
  const piece = document.createElement("button");
  piece.className = "piece";
  piece.type = "button";
  piece.dataset.index = String(index);
  piece.style.setProperty("--puzzle-image", `url("${currentPuzzle.image}")`);
  piece.style.setProperty("--piece-x", x);
  piece.style.setProperty("--piece-y", y);
  piece.setAttribute("aria-label", `ピース ${index + 1}`);
  piece.addEventListener("pointerdown", startDrag);
  return piece;
}

function sizeTrayPieces() {
  const slot = board.querySelector(".slot");
  if (!slot) return;

  const slotRect = slot.getBoundingClientRect();
  const mobileScale = window.innerWidth < 760 ? 0.68 : 0.56;
  const size = Math.max(54, Math.min(slotRect.width * mobileScale, 110));
  document.documentElement.style.setProperty("--piece-width", `${size}px`);
}

function resetGame() {
  stopConfetti();
  finishScreen.hidden = true;
  createSlots();
  tray.innerHTML = "";

  const pieces = Array.from({ length: ROWS * COLS }, (_, index) => createPiece(index));
  for (const piece of shuffle(pieces)) {
    tray.append(piece);
  }

  requestAnimationFrame(sizeTrayPieces);
}

function startDrag(event) {
  const piece = event.currentTarget;

  event.preventDefault();

  const originSlot = piece.closest(".slot");
  const rect = piece.getBoundingClientRect();
  activeDrag = {
    piece,
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    originSlot,
  };

  if (originSlot) {
    originSlot.classList.remove("is-filled");
  }

  piece.classList.remove("is-placed", "is-wrong");
  piece.classList.add("is-dragging");
  piece.style.width = `${rect.width}px`;
  piece.style.height = `${rect.height}px`;
  piece.style.left = `${rect.left}px`;
  piece.style.top = `${rect.top}px`;
  document.body.append(piece);
  piece.setPointerCapture(event.pointerId);

  moveDrag(event);
  piece.addEventListener("pointermove", moveDrag);
  piece.addEventListener("pointerup", endDrag);
  piece.addEventListener("pointercancel", cancelDrag);
}

function moveDrag(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

  const left = event.clientX - activeDrag.offsetX;
  const top = event.clientY - activeDrag.offsetY;
  activeDrag.piece.style.left = `${left}px`;
  activeDrag.piece.style.top = `${top}px`;
}

function endDrag(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

  const { piece } = activeDrag;
  removeDragListeners(piece);
  const targetSlot = findDropSlot(piece, event);

  if (targetSlot) {
    placePiece(piece, targetSlot);
  } else {
    returnPiece(piece);
  }

  activeDrag = null;
}

function cancelDrag(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

  const { piece } = activeDrag;
  removeDragListeners(piece);
  returnPiece(piece);
  activeDrag = null;
}

function removeDragListeners(piece) {
  piece.removeEventListener("pointermove", moveDrag);
  piece.removeEventListener("pointerup", endDrag);
  piece.removeEventListener("pointercancel", cancelDrag);
}

function findDropSlot(piece, event) {
  const pieceRect = piece.getBoundingClientRect();
  let bestSlot = null;
  let bestOverlap = 0;

  for (const slot of board.querySelectorAll(".slot")) {
    const slotRect = slot.getBoundingClientRect();
    const padding = Math.min(slotRect.width, slotRect.height) * 0.3;
    const pointerIsNearSlot =
      event.clientX >= slotRect.left - padding &&
      event.clientX <= slotRect.right + padding &&
      event.clientY >= slotRect.top - padding &&
      event.clientY <= slotRect.bottom + padding;

    if (pointerIsNearSlot) {
      return slot;
    }

    const overlapWidth = Math.max(0, Math.min(pieceRect.right, slotRect.right) - Math.max(pieceRect.left, slotRect.left));
    const overlapHeight = Math.max(0, Math.min(pieceRect.bottom, slotRect.bottom) - Math.max(pieceRect.top, slotRect.top));
    const overlapArea = overlapWidth * overlapHeight;

    if (overlapArea > bestOverlap) {
      bestOverlap = overlapArea;
      bestSlot = slot;
    }
  }

  const minimumOverlap = pieceRect.width * pieceRect.height * 0.12;
  return bestOverlap >= minimumOverlap ? bestSlot : null;
}

function clearFreePosition(piece) {
  piece.style.left = "";
  piece.style.top = "";
  piece.style.width = "";
  piece.style.height = "";
}

function placePiece(piece, slot) {
  const { originSlot } = activeDrag || {};
  const existingPiece = slot.querySelector(".piece");

  if (existingPiece && existingPiece !== piece) {
    if (originSlot && originSlot !== slot) {
      putPieceInSlot(existingPiece, originSlot);
    } else {
      putPieceInTray(existingPiece);
    }
  }

  putPieceInSlot(piece, slot);
  checkCompletion();
}

function putPieceInSlot(piece, slot) {
  clearFreePosition(piece);
  piece.classList.remove("is-dragging", "is-wrong");
  piece.classList.add("is-placed");
  piece.tabIndex = 0;
  slot.classList.add("is-filled");
  slot.append(piece);
}

function putPieceInTray(piece) {
  clearFreePosition(piece);
  piece.classList.remove("is-dragging", "is-placed", "is-wrong");
  piece.tabIndex = 0;
  tray.append(piece);
}

function returnPiece(piece) {
  const { originSlot } = activeDrag || {};

  if (originSlot) {
    putPieceInSlot(piece, originSlot);
  } else {
    putPieceInTray(piece);
  }
}

function checkCompletion() {
  const slots = [...board.querySelectorAll(".slot")];
  const solved = slots.every((slot) => {
    const piece = slot.querySelector(".piece");
    return piece && piece.dataset.index === slot.dataset.index;
  });

  if (solved) {
    setTimeout(showFinish, 360);
  }
}

function showFinish() {
  finishScreen.hidden = false;
  startConfetti();
}

function resizeConfettiCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(window.innerWidth * pixelRatio);
  confettiCanvas.height = Math.floor(window.innerHeight * pixelRatio);
  confettiCanvas.style.width = `${window.innerWidth}px`;
  confettiCanvas.style.height = `${window.innerHeight}px`;
  confettiContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function startConfetti() {
  resizeConfettiCanvas();
  const colors = ["#31a8ff", "#32cf83", "#ff6fae", "#ffd84d", "#ff9f43", "#8b5cf6"];
  confettiPieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -30 - Math.random() * window.innerHeight * 0.45,
    size: 7 + Math.random() * 12,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: 2.5 + Math.random() * 4.5,
    drift: -1.8 + Math.random() * 3.6,
    rotation: Math.random() * Math.PI,
    spin: -0.18 + Math.random() * 0.36,
  }));
  drawConfetti();
}

function drawConfetti() {
  confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const piece of confettiPieces) {
    piece.x += piece.drift;
    piece.y += piece.speed;
    piece.rotation += piece.spin;

    if (piece.y > window.innerHeight + 40) {
      piece.y = -40;
      piece.x = Math.random() * window.innerWidth;
    }

    confettiContext.save();
    confettiContext.translate(piece.x, piece.y);
    confettiContext.rotate(piece.rotation);
    confettiContext.fillStyle = piece.color;
    confettiContext.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.58);
    confettiContext.restore();
  }
  confettiFrame = requestAnimationFrame(drawConfetti);
}

function stopConfetti() {
  if (confettiFrame) {
    cancelAnimationFrame(confettiFrame);
    confettiFrame = null;
  }
  confettiContext.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

resetButton.addEventListener("click", resetGame);
againButton.addEventListener("click", resetGame);
window.addEventListener("resize", () => {
  sizeTrayPieces();
  if (!finishScreen.hidden) {
    resizeConfettiCanvas();
  }
});

chooseAvailablePuzzles().then((loadedPuzzles) => {
  availablePuzzles = loadedPuzzles;
  currentPuzzle = availablePuzzles[0] || currentPuzzle;
  createPuzzlePicker();
  selectPuzzle(currentPuzzle.id);
});
