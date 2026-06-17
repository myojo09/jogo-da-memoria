/* =================================================================
   JOGO DA MEMÓRIA — RAÇAS DE CACHORROS
   Lógica do jogo em JavaScript puro (sem frameworks)
   ================================================================= */

/* -----------------------------------------------------------------
   1) DADOS DAS RAÇAS
   8 raças no total. A "American Bully" usa a foto da Frida (local).
   As demais buscam uma foto real em tempo de execução na Dog CEO API
   (https://dog.ceo) — uma API pública e gratuita de fotos de cães.
   Se a busca falhar (ex.: sem internet), uma imagem alternativa
   gerada localmente é usada, então o jogo nunca quebra.
----------------------------------------------------------------- */
const BREEDS = [
  {
    id: "americanbully",
    name: "American Bully",
    local: true,
    localSrc: "assets/frida.jpg",
    fact: "É uma raça relativamente nova, reconhecida oficialmente em 2013/2014. Apesar do porte musculoso, é conhecida por ser dócil e extremamente apegada à família — como a Frida!"
  },
  {
    id: "goldenretriever",
    name: "Golden Retriever",
    apiPath: "retriever/golden",
    fact: "Foi criado na Escócia, no século XIX, para recuperar aves abatidas na caça sem danificá-las — por isso tem a boca tão suave."
  },
  {
    id: "labrador",
    name: "Labrador Retriever",
    apiPath: "labrador",
    fact: "É uma das raças mais populares do mundo e adora água: possui dedos com membranas que funcionam quase como pés de nadador."
  },
  {
    id: "husky",
    name: "Husky Siberiano",
    apiPath: "husky",
    fact: "Aguenta temperaturas extremamente baixas graças à pelagem dupla, e consegue correr por horas puxando trenós no gelo."
  },
  {
    id: "pug",
    name: "Pug",
    apiPath: "pug",
    fact: "Tem origem na China antiga, onde era criado como companheiro de nobres e imperadores há mais de 2.000 anos."
  },
  {
    id: "poodle",
    name: "Poodle",
    apiPath: "poodle/standard",
    fact: "Apesar da imagem elegante, é uma das raças mais inteligentes que existem e é muito usada em trabalhos de resgate e terapia."
  },
  {
    id: "pastoralemao",
    name: "Pastor Alemão",
    apiPath: "german/shepherd",
    fact: "É uma das raças mais versáteis do mundo: atua como cão policial, cão-guia, pastor de rebanhos e cão de busca e salvamento."
  },
  {
    id: "bulldogfrances",
    name: "Bulldog Francês",
    apiPath: "bulldog/french",
    fact: "Surgiu na França no século XIX, a partir de bulldogs ingleses menores levados por operários que migraram para Paris."
  }
];

/* -----------------------------------------------------------------
   2) CONFIGURAÇÃO DE DIFICULDADE
   Cada nível define um limite de tempo (em segundos) para terminar
   o jogo. Se o tempo esgotar antes de encontrar todos os pares,
   a tela de "tempo esgotado" é exibida.
----------------------------------------------------------------- */
const DIFFICULTY = {
  casual: { label: "Casual", maxTime: 300 },
  medio: { label: "Médio", maxTime: 180 },
  dificil: { label: "Difícil", maxTime: 120 }
};

/* -----------------------------------------------------------------
   3) ESTADO GLOBAL DO JOGO
----------------------------------------------------------------- */
const state = {
  difficulty: "casual",
  cards: [],          // 16 cartas (8 pares) na ordem embaralhada
  firstCard: null,
  secondCard: null,
  boardLocked: false,
  moves: 0,
  matchedPairs: 0,
  elapsedSeconds: 0,
  timerId: null,
  isPaused: false
};

/* -----------------------------------------------------------------
   4) REFERÊNCIAS DE ELEMENTOS
----------------------------------------------------------------- */
const el = {
  screens: {
    menu: document.getElementById("screen-menu"),
    instructions: document.getElementById("screen-instructions"),
    game: document.getElementById("screen-game"),
    end: document.getElementById("screen-end")
  },
  board: document.getElementById("game-board"),
  boardLoading: document.getElementById("board-loading"),
  statMoves: document.getElementById("stat-moves"),
  statTime: document.getElementById("stat-time"),
  statPairs: document.getElementById("stat-pairs"),
  pauseOverlay: document.getElementById("pause-overlay"),
  factToast: document.getElementById("fact-toast"),
  factToastName: document.getElementById("fact-toast-name"),
  factToastText: document.getElementById("fact-toast-text"),
  endIcon: document.getElementById("end-icon"),
  endTitle: document.getElementById("end-title"),
  endSubtitle: document.getElementById("end-subtitle"),
  endStars: document.getElementById("end-stars"),
  endMoves: document.getElementById("end-moves"),
  endTime: document.getElementById("end-time"),
  endMessage: document.getElementById("end-message"),
  confettiLayer: document.getElementById("confetti-layer")
};

/* -----------------------------------------------------------------
   5) NAVEGAÇÃO ENTRE TELAS
----------------------------------------------------------------- */
function showScreen(name) {
  Object.values(el.screens).forEach((s) => s.classList.remove("active"));
  el.screens[name].classList.add("active");
}

/* -----------------------------------------------------------------
   6) ÁUDIO (gerado via Web Audio API — sem arquivos externos)
----------------------------------------------------------------- */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq, duration, type = "sine", delay = 0, volume = 0.18) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startTime = ctx.currentTime + delay;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch (e) {
    /* Ambiente sem suporte a áudio: o jogo continua normalmente */
  }
}

const sounds = {
  flip: () => playTone(520, 0.12, "triangle"),
  match: () => {
    playTone(660, 0.14, "sine");
    playTone(880, 0.18, "sine", 0.12);
  },
  mismatch: () => playTone(160, 0.25, "sawtooth", 0, 0.12),
  victory: () => {
    [523, 659, 784, 1046].forEach((f, i) => playTone(f, 0.22, "sine", i * 0.14));
  },
  timeUp: () => {
    [400, 320, 240].forEach((f, i) => playTone(f, 0.3, "sawtooth", i * 0.18, 0.12));
  }
};

/* -----------------------------------------------------------------
   7) BUSCA DAS IMAGENS DAS RAÇAS
   Tenta buscar uma foto real na Dog CEO API. Em caso de falha,
   gera localmente um cartão substituto (sem depender da internet).
----------------------------------------------------------------- */
function fallbackImage(name) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="200" height="200" fill="#16a085"/>
      <text x="50%" y="55%" font-family="Arial" font-size="48" fill="white"
            text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

async function fetchBreedImage(breed) {
  if (breed.local) return breed.localSrc;
  try {
    const res = await fetch(`https://dog.ceo/api/breed/${breed.apiPath}/images/random`);
    if (!res.ok) throw new Error("Falha na resposta da API");
    const data = await res.json();
    if (data.status === "success" && data.message) return data.message;
    throw new Error("Resposta inesperada da API");
  } catch (err) {
    return fallbackImage(breed.name);
  }
}

/* -----------------------------------------------------------------
   8) MONTAGEM E EMBARALHAMENTO DO TABULEIRO
----------------------------------------------------------------- */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function buildBoard() {
  el.board.classList.remove("ready");
  el.boardLoading.style.display = "flex";
  el.board.innerHTML = "";

  // Busca as 8 imagens em paralelo
  const images = await Promise.all(BREEDS.map(fetchBreedImage));

  // Cria 2 cartas para cada raça (par)
  let pairCards = [];
  BREEDS.forEach((breed, i) => {
    for (let copy = 0; copy < 2; copy++) {
      pairCards.push({
        breedId: breed.id,
        name: breed.name,
        fact: breed.fact,
        img: images[i],
        matched: false
      });
    }
  });

  state.cards = shuffle(pairCards);

  // Renderiza as cartas no DOM
  state.cards.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.dataset.index = index;
    cardEl.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-face-down">🐾</div>
        <div class="card-face card-face-up">
          <img src="${card.img}" alt="${card.name}" />
          <span>${card.name}</span>
        </div>
      </div>`;
    cardEl.addEventListener("click", () => handleCardClick(cardEl, card));
    el.board.appendChild(cardEl);
  });

  el.boardLoading.style.display = "none";
  el.board.classList.add("ready");
}

/* -----------------------------------------------------------------
   9) LÓGICA DE JOGADA (virar cartas / comparar pares)
----------------------------------------------------------------- */
function handleCardClick(cardEl, card) {
  if (state.boardLocked || state.isPaused) return;
  if (cardEl.classList.contains("flipped") || cardEl.classList.contains("matched")) return;

  cardEl.classList.add("flipped");
  sounds.flip();

  if (!state.firstCard) {
    state.firstCard = { cardEl, card };
    return;
  }

  state.secondCard = { cardEl, card };
  state.boardLocked = true;
  state.moves++;
  el.statMoves.textContent = state.moves;

  const isMatch = state.firstCard.card.breedId === state.secondCard.card.breedId;

  if (isMatch) {
    resolveMatch();
  } else {
    setTimeout(resolveMismatch, 1000);
  }
}

function resolveMatch() {
  const { firstCard, secondCard } = state;
  firstCard.cardEl.classList.add("matched");
  secondCard.cardEl.classList.add("matched");
  sounds.match();

  state.matchedPairs++;
  el.statPairs.textContent = `${state.matchedPairs} / 8`;

  showFactToast(firstCard.card.name, firstCard.card.fact);

  state.firstCard = null;
  state.secondCard = null;
  state.boardLocked = false;

  if (state.matchedPairs === BREEDS.length) {
    endGame(true);
  }
}

function resolveMismatch() {
  const { firstCard, secondCard } = state;
  firstCard.cardEl.classList.add("mismatch");
  secondCard.cardEl.classList.add("mismatch");
  sounds.mismatch();

  setTimeout(() => {
    firstCard.cardEl.classList.remove("flipped", "mismatch");
    secondCard.cardEl.classList.remove("flipped", "mismatch");
    state.firstCard = null;
    state.secondCard = null;
    state.boardLocked = false;
  }, 350);
}

/* -----------------------------------------------------------------
   10) TOAST DE CURIOSIDADE
----------------------------------------------------------------- */
let factToastTimeout = null;
function showFactToast(name, fact) {
  el.factToastName.textContent = `🐾 ${name}`;
  el.factToastText.textContent = fact;
  el.factToast.classList.add("visible");

  clearTimeout(factToastTimeout);
  factToastTimeout = setTimeout(() => {
    el.factToast.classList.remove("visible");
  }, 3800);
}

/* -----------------------------------------------------------------
   11) CRONÔMETRO
----------------------------------------------------------------- */
function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function startTimer() {
  stopTimer();
  state.timerId = setInterval(() => {
    if (state.isPaused) return;
    state.elapsedSeconds++;
    el.statTime.textContent = formatTime(state.elapsedSeconds);

    const limit = DIFFICULTY[state.difficulty].maxTime;
    if (state.elapsedSeconds >= limit) {
      endGame(false);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

/* -----------------------------------------------------------------
   12) PAUSA
----------------------------------------------------------------- */
function pauseGame() {
  if (!el.screens.game.classList.contains("active")) return;
  state.isPaused = true;
  el.pauseOverlay.classList.add("visible");
}
function resumeGame() {
  state.isPaused = false;
  el.pauseOverlay.classList.remove("visible");
}

/* -----------------------------------------------------------------
   13) INÍCIO E FIM DE JOGO
----------------------------------------------------------------- */
async function startGame(difficulty) {
  state.difficulty = difficulty;
  state.firstCard = null;
  state.secondCard = null;
  state.boardLocked = true; // travado até o tabuleiro carregar
  state.moves = 0;
  state.matchedPairs = 0;
  state.elapsedSeconds = 0;
  state.isPaused = false;

  el.statMoves.textContent = "0";
  el.statTime.textContent = "00:00";
  el.statPairs.textContent = "0 / 8";
  el.pauseOverlay.classList.remove("visible");

  showScreen("game");
  await buildBoard();
  state.boardLocked = false;
  startTimer();
}

function calculateStars(moves) {
  if (moves <= 20) return 3;
  if (moves <= 30) return 2;
  return 1;
}

function launchConfetti() {
  const colors = ["#16a085", "#c0392b", "#f1c40f", "#ffffff"];
  el.confettiLayer.innerHTML = "";
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = 1.4 + Math.random() * 1.2 + "s";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    el.confettiLayer.appendChild(piece);
  }
}

function endGame(won) {
  stopTimer();
  state.boardLocked = true;

  if (won) {
    const stars = calculateStars(state.moves);
    sounds.victory();
    el.endIcon.textContent = "🏆";
    el.endTitle.textContent = "PARABÉNS!";
    el.endSubtitle.textContent = "VOCÊ COMPLETOU O JOGO!";
    el.endStars.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    el.endMessage.textContent =
      stars === 3 ? "DESEMPENHO PERFEITO!" : stars === 2 ? "ÓTIMO TRABALHO!" : "VOCÊ CONSEGUIU!";
    launchConfetti();
  } else {
    sounds.timeUp();
    el.endIcon.textContent = "⏰";
    el.endTitle.textContent = "TEMPO ESGOTADO!";
    el.endSubtitle.textContent = "Quase lá — tente novamente!";
    el.endStars.textContent = "";
    el.endMessage.textContent = `Você encontrou ${state.matchedPairs} de 8 pares.`;
    el.confettiLayer.innerHTML = "";
  }

  el.endMoves.textContent = state.moves;
  el.endTime.textContent = formatTime(state.elapsedSeconds);

  showScreen("end");
}

/* -----------------------------------------------------------------
   14) EVENTOS DE INTERFACE
----------------------------------------------------------------- */

// Menu inicial
document.getElementById("btn-menu-play").addEventListener("click", () => {
  startGame(state.difficulty || "casual");
});
document.getElementById("btn-menu-instructions").addEventListener("click", () => {
  showScreen("instructions");
});

// Tela de instruções — seleção de dificuldade
document.querySelectorAll(".diff-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.difficulty = btn.dataset.difficulty;
  });
});
document.getElementById("btn-instructions-play").addEventListener("click", () => {
  startGame(state.difficulty);
});

// Pausa
document.getElementById("btn-pause").addEventListener("click", pauseGame);
document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-pause-menu").addEventListener("click", () => {
  resumeGame();
  stopTimer();
  showScreen("menu");
});
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "p") return;
  if (!el.screens.game.classList.contains("active")) return;
  state.isPaused ? resumeGame() : pauseGame();
});

// Tela de fim de jogo
document.getElementById("btn-play-again").addEventListener("click", () => {
  startGame(state.difficulty);
});
document.getElementById("btn-end-menu").addEventListener("click", () => {
  showScreen("menu");
});
