const state = {
  studentId: localStorage.getItem("studentId") || "demo-student",
  sessionId: null,
  trace: [],
  nextQuiz: null,
  quizAttempt: 1,
  catalog: [],
  catalogTotal: null,
  catalogCompleted: 0,
  recommendation: null,
  sessions: [],
};

const voice = {
  socket: null,
  stream: null,
  context: null,
  processor: null,
  source: null,
  playbackCursor: 0,
  stopping: false,
};

const $ = (id) => document.getElementById(id);
const chatForm = $("chat-form");
const quizForm = $("quiz-form");
const activeSessionKey = `activeSession:${state.studentId}`;

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("message").value.trim();
  if (!message) return;
  await sendChat(message);
});

$("topic-grid").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-start-topic]");
  if (!button) return;
  const selected = state.catalog.find(
    (item) => item.topic === button.dataset.startTopic,
  );
  if (!selected) return;
  startNewConversation();
  await sendChat(`Quiero aprender sobre ${selected.title}`);
});

$("start-recommended").addEventListener("click", async () => {
  if (!state.recommendation) return;
  startNewConversation();
  await sendChat(`Quiero aprender sobre ${state.recommendation.title}`);
});

$("category-filter").addEventListener("change", renderTopicCatalog);
$("level-filter").addEventListener("change", renderTopicCatalog);

async function sendChat(message) {
  setBusy(true);
  showError("");
  $("feedback").classList.add("hidden");
  $("quiz-card").classList.add("hidden");
  appendMessage("user", "Tú", message);
  $("message").value = "";
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: state.studentId,
        session_id: state.sessionId,
        message,
      }),
    });
    const data = await readResponse(response);
    state.sessionId = data.session_id;
    localStorage.setItem(activeSessionKey, state.sessionId);
    state.trace = data.trace;
    state.quizAttempt = data.quiz_attempt;
    state.nextQuiz = null;
    renderChat(data);
    await loadSessions();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

quizForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = quizForm.querySelector("button");
  const answer = $("quiz-answer").value.trim();
  if (!answer) return;
  button.disabled = true;
  button.querySelector("span").textContent = "Analizando…";
  showError("");
  appendMessage("user", "Tu explicación", answer);
  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: state.studentId,
        session_id: state.sessionId,
        answer,
      }),
    });
    const data = await readResponse(response);
    state.trace.push(...data.trace);
    state.nextQuiz = data.next_quiz;
    state.quizAttempt = data.attempt + 1;
    renderFeedback(data);
    appendMessage(
      "assistant",
      "Evaluator Agent",
      data.feedback,
      [],
      data.learning_context,
    );
    renderProgress(data.progress);
    renderTrace();
    await loadTopicCatalog();
    await loadSessions();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Recibir feedback";
  }
});

$("continue-learning").addEventListener("click", () => {
  if (!state.nextQuiz) return;
  $("quiz-kicker").textContent = "Comprueba tu comprensión";
  $("question").textContent = state.nextQuiz.question;
  $("question").classList.remove("hidden");
  $("quiz-step").textContent = `Ronda ${state.quizAttempt}`;
  $("quiz-answer").value = "";
  $("feedback").classList.add("hidden");
  quizForm.classList.remove("hidden");
  $("quiz-answer").focus();
  $("quiz-card").scrollIntoView({ behavior: "smooth", block: "center" });
});

$("clear-trace").addEventListener("click", () => {
  state.trace = [];
  renderTrace();
});

$("session-select").addEventListener("change", async (event) => {
  if (!event.target.value) {
    startNewConversation();
    return;
  }
  await openSession(event.target.value);
});

$("new-session").addEventListener("click", startNewConversation);

$("rename-session").addEventListener("click", async () => {
  if (!state.sessionId) return;
  const current = state.sessions.find((item) => item.id === state.sessionId);
  const title = window.prompt(
    "Nuevo nombre de la conversación",
    current?.title || "",
  )?.trim();
  if (!title || title === current?.title) return;
  await updateSession({ title });
});

$("archive-session").addEventListener("click", async () => {
  if (!state.sessionId) return;
  await updateSession({ archived: true });
  startNewConversation();
  await loadSessions();
});

$("mic").addEventListener("click", async () => {
  if (voice.socket) stopVoice();
  else await startVoice();
});

initializeCapabilities();
loadTopicCatalog();
loadSessions({ restore: true });

async function initializeCapabilities() {
  try {
    const capabilities = await fetch("/api/capabilities").then(readResponse);
    $("mic").disabled = !capabilities.voice;
    $("mic").title = capabilities.voice
      ? "Iniciar conversación por voz"
      : "Voz no configurada; el modo texto sigue disponible";
  } catch {
    $("mic").disabled = true;
  }
}

async function loadTopicCatalog() {
  $("topic-grid").innerHTML =
    '<p class="catalog-message">Consultando el catálogo del MCP…</p>';
  try {
    const response = await fetch(
      `/api/topics?student_id=${encodeURIComponent(state.studentId)}`,
    );
    const data = await readResponse(response);
    state.catalog = data.topics;
    state.catalogTotal = data.total_topics;
    state.catalogCompleted = data.completed_topics;
    state.recommendation = data.recommendation;
    populateCatalogFilters(data.topics);
    renderLearningPath();
    renderTopicCatalog();
    renderProgress(data.progress);
  } catch (error) {
    $("topics-count").textContent = "No disponible";
    $("topic-grid").innerHTML =
      `<p class="catalog-message error">No pudimos cargar los temas. ${escapeHtml(error.message)}</p>`;
  }
}

async function loadSessions({ restore = false } = {}) {
  try {
    const response = await fetch(
      `/api/sessions?student_id=${encodeURIComponent(state.studentId)}`,
    );
    const data = await readResponse(response);
    state.sessions = data.sessions;
    const select = $("session-select");
    select.innerHTML =
      '<option value="">Nueva conversación</option>' +
      state.sessions
        .map(
          (session) =>
            `<option value="${escapeHtml(session.id)}">${escapeHtml(session.title)}</option>`,
        )
        .join("");
    if (state.sessionId && state.sessions.some((item) => item.id === state.sessionId)) {
      select.value = state.sessionId;
    }
    if (restore) {
      const saved = localStorage.getItem(activeSessionKey);
      if (saved && state.sessions.some((item) => item.id === saved)) {
        await openSession(saved);
      }
    }
    updateSessionActions();
  } catch (error) {
    showError(`No pudimos sincronizar las conversaciones. ${error.message}`);
  }
}

async function openSession(sessionId) {
  setBusy(true);
  showError("");
  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}?student_id=${encodeURIComponent(state.studentId)}`,
    );
    const session = await readResponse(response);
    state.sessionId = session.id;
    state.trace = [];
    state.quizAttempt = session.pending_quiz.attempt;
    state.nextQuiz = { question: session.pending_quiz.question };
    localStorage.setItem(activeSessionKey, session.id);
    resetConversation({ keepSession: true });
    session.messages.forEach((message) => {
      appendMessage(
        message.role,
        message.label,
        message.content,
        message.sources,
        message.note,
      );
    });
    const topicProgress = state.catalog.find(
      (item) => item.topic === session.topic,
    )?.progress;
    $("topic-badge").textContent = topicTitle(session.topic);
    $("level-badge").textContent = levelLabel(topicProgress?.level || "beginner");
    $("detected").classList.remove("hidden");
    $("question").textContent = session.pending_quiz.question;
    $("quiz-topic").textContent = topicTitle(session.topic);
    $("quiz-kicker").textContent = "Comprueba tu comprensión";
    $("quiz-step").textContent = `Ronda ${session.pending_quiz.attempt}`;
    $("question").classList.remove("hidden");
    quizForm.classList.remove("hidden");
    $("quiz-card").classList.remove("hidden");
    $("session-select").value = session.id;
    updateSessionActions();
  } catch (error) {
    showError(error.message);
    startNewConversation();
  } finally {
    setBusy(false);
  }
}

async function updateSession(update) {
  showError("");
  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(state.sessionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: state.studentId, ...update }),
      },
    );
    await readResponse(response);
    await loadSessions();
  } catch (error) {
    showError(error.message);
  }
}

function startNewConversation() {
  state.sessionId = null;
  state.trace = [];
  state.nextQuiz = null;
  state.quizAttempt = 1;
  localStorage.removeItem(activeSessionKey);
  resetConversation();
}

function resetConversation({ keepSession = false } = {}) {
  document
    .querySelectorAll("#conversation-feed .chat-message")
    .forEach((message) => message.remove());
  $("welcome").classList.remove("hidden");
  $("detected").classList.add("hidden");
  $("quiz-card").classList.add("hidden");
  $("feedback").classList.add("hidden");
  $("quiz-answer").value = "";
  if (!keepSession) $("session-select").value = "";
  renderTrace();
  updateSessionActions();
}

function updateSessionActions() {
  const hasSession = Boolean(state.sessionId);
  $("rename-session").disabled = !hasSession;
  $("archive-session").disabled = !hasSession;
}

function populateCatalogFilters(topics) {
  const category = $("category-filter");
  const level = $("level-filter");
  const selectedCategory = category.value;
  const selectedLevel = level.value;
  const categories = [...new Set(topics.map((item) => item.category))];
  const levels = [
    ...new Set(topics.flatMap((item) => item.available_levels)),
  ];
  category.innerHTML =
    '<option value="">Todas las categorías</option>' +
    categories
      .map(
        (value) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(categoryLabel(value))}</option>`,
      )
      .join("");
  level.innerHTML =
    '<option value="">Todos los niveles</option>' +
    levels
      .map(
        (value) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(levelLabel(value))}</option>`,
      )
      .join("");
  category.value = categories.includes(selectedCategory) ? selectedCategory : "";
  level.value = levels.includes(selectedLevel) ? selectedLevel : "";
}

function renderTopicCatalog() {
  const category = $("category-filter").value;
  const level = $("level-filter").value;
  const visible = state.catalog.filter(
    (item) =>
      (!category || item.category === category) &&
      (!level || item.available_levels.includes(level)),
  );
  $("topics-count").textContent =
    visible.length === state.catalogTotal
      ? `${state.catalogTotal} temas`
      : `${visible.length} de ${state.catalogTotal} temas`;
  if (!visible.length) {
    $("topic-grid").innerHTML =
      '<p class="catalog-message">No hay temas que coincidan con estos filtros.</p>';
    return;
  }
  $("topic-grid").innerHTML = visible
    .map(
      (item) => `
        <article class="topic-card ${item.status}">
          <div class="topic-card-heading">
            <span class="category-label">${escapeHtml(categoryLabel(item.category))}</span>
            <span class="topic-status ${item.status}">
              ${escapeHtml(topicStatusLabel(item.status))}
            </span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          ${
            item.prerequisites.length
              ? `<p class="prerequisite-copy">${
                  item.unmet_prerequisites.length
                    ? `Antes se recomienda: ${escapeHtml(item.unmet_prerequisites.map(topicTitle).join(", "))}`
                    : "Prerrequisitos completados"
                }</p>`
              : '<p class="prerequisite-copy">Sin prerrequisitos</p>'
          }
          <div class="level-list">
            ${item.available_levels
              .map((available) => `<span>${escapeHtml(levelLabel(available))}</span>`)
              .join("")}
          </div>
          ${
            item.progress
              ? `<div class="topic-progress-summary">
                  <strong>${Math.round(item.progress.best_score)}/100</strong>
                  <span>${escapeHtml(levelLabel(item.progress.level))}</span>
                  <span>${item.progress.attempts} ${item.progress.attempts === 1 ? "intento" : "intentos"}</span>
                </div>`
              : ""
          }
          <button type="button" data-start-topic="${escapeHtml(item.topic)}">
            ${escapeHtml(topicActionLabel(item.status))} <b>→</b>
          </button>
        </article>`,
    )
    .join("");
}

function renderLearningPath() {
  const card = $("learning-path-card");
  if (!state.recommendation) {
    card.classList.add("hidden");
    return;
  }
  $("recommended-topic").textContent = state.recommendation.title;
  $("recommendation-reason").textContent = state.recommendation.reason;
  card.classList.remove("hidden");
}

async function startVoice() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("Este navegador no permite capturar el micrófono. Continúa por texto.");
    return;
  }
  try {
    voice.stopping = false;
    voice.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    voice.context = new AudioContext();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    voice.socket = new WebSocket(`${protocol}//${location.host}/ws/live`);
    voice.socket.binaryType = "arraybuffer";
    voice.socket.onmessage = handleVoiceMessage;
    voice.socket.onerror = () => voiceFallback("No se pudo conectar la voz.");
    voice.socket.onclose = () => {
      if (!voice.stopping) voiceFallback("La voz se desconectó.");
      cleanupVoice();
    };
    setVoiceStatus("Conectando con Gemini Live…");
  } catch (error) {
    voiceFallback(error.name === "NotAllowedError" ? "Permiso de micrófono denegado." : error.message);
    cleanupVoice();
  }
}

async function handleVoiceMessage(event) {
  if (event.data instanceof ArrayBuffer) {
    playPcm24(event.data);
    return;
  }
  const message = JSON.parse(event.data);
  if (message.type === "ready") {
    beginCapture();
    $("mic").classList.add("active");
    setVoiceStatus("Escuchando… pulsa el micrófono para terminar.");
  } else if (message.type === "transcript") {
    setVoiceStatus(`${message.role === "user" ? "Tú" : "Tutor"}: ${message.text}`);
  } else if (message.type === "turn_complete") {
    setVoiceStatus("Escuchando…");
  } else if (message.type === "unavailable" || message.type === "error") {
    voiceFallback(message.message);
  }
}

function beginCapture() {
  voice.source = voice.context.createMediaStreamSource(voice.stream);
  voice.processor = voice.context.createScriptProcessor(4096, 1, 1);
  voice.processor.onaudioprocess = (event) => {
    if (voice.socket?.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsample(input, voice.context.sampleRate, 16000);
    const pcm = new Int16Array(downsampled.length);
    downsampled.forEach((sample, index) => {
      pcm[index] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    });
    voice.socket.send(pcm.buffer);
  };
  voice.source.connect(voice.processor);
  voice.processor.connect(voice.context.destination);
}

function downsample(buffer, inputRate, outputRate) {
  if (inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const result = new Float32Array(Math.round(buffer.length / ratio));
  for (let i = 0; i < result.length; i += 1) {
    const start = Math.round(i * ratio);
    const end = Math.min(buffer.length, Math.round((i + 1) * ratio));
    let sum = 0;
    for (let offset = start; offset < end; offset += 1) sum += buffer[offset];
    result[i] = sum / Math.max(1, end - start);
  }
  return result;
}

function playPcm24(arrayBuffer) {
  if (!voice.context) return;
  const pcm = new Int16Array(arrayBuffer);
  const audioBuffer = voice.context.createBuffer(1, pcm.length, 24000);
  const channel = audioBuffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;
  const source = voice.context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(voice.context.destination);
  voice.playbackCursor = Math.max(voice.context.currentTime, voice.playbackCursor);
  source.start(voice.playbackCursor);
  voice.playbackCursor += audioBuffer.duration;
}

function stopVoice() {
  voice.stopping = true;
  if (voice.socket?.readyState === WebSocket.OPEN) {
    voice.socket.send(JSON.stringify({ type: "stop_audio" }));
    voice.socket.close(1000, "user stopped voice");
  }
  cleanupVoice();
  setVoiceStatus("Voz detenida. Puedes continuar por texto.");
}

function cleanupVoice() {
  voice.processor?.disconnect();
  voice.source?.disconnect();
  voice.stream?.getTracks().forEach((track) => track.stop());
  voice.context?.close();
  voice.socket = null;
  voice.stream = null;
  voice.context = null;
  voice.processor = null;
  voice.source = null;
  voice.playbackCursor = 0;
  $("mic").classList.remove("active");
}

function voiceFallback(message) {
  setVoiceStatus(`${message} Continúa usando el chat de texto.`);
}

function setVoiceStatus(message) {
  $("voice-status").textContent = message;
  $("voice-status").classList.toggle("hidden", !message);
}

async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join(". ")
      : data.detail;
    throw new Error(detail || "La solicitud no pudo completarse.");
  }
  return data;
}

function renderChat(data) {
  $("welcome").classList.add("hidden");
  appendMessage("assistant", "Tutor Agent", data.answer, data.sources);
  $("topic-badge").textContent = pretty(data.topic);
  $("level-badge").textContent = levelLabel(data.level);
  $("detected").classList.remove("hidden");
  $("question").textContent = data.quiz.question;
  $("quiz-topic").textContent = pretty(data.topic);
  $("quiz-kicker").textContent = "Comprueba tu comprensión";
  $("quiz-step").textContent = `Ronda ${data.quiz_attempt}`;
  $("question").classList.remove("hidden");
  $("quiz-answer").value = "";
  quizForm.classList.remove("hidden");
  $("quiz-card").classList.remove("hidden");
  renderProgress(data.progress);
  renderTrace();
  $("quiz-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderFeedback(data) {
  const labels = {
    reinforce: ["Vamos a reforzar", "Una base más clara"],
    progressing: ["Vas progresando", "Conecta una idea más"],
    mastered: ["Concepto comprendido", "Listo para aplicarlo"],
  };
  const [status, title] = labels[data.status] || ["Feedback", "Siguiente paso"];
  $("feedback-score").textContent = Math.round(data.score);
  $("feedback-status").textContent = status;
  $("feedback-title").textContent = title;
  $("feedback-copy").textContent = data.feedback;
  $("strengths").innerHTML = data.strengths
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  $("improvements").innerHTML = data.improvements
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const rubricLabels = {
    precision: "Precisión",
    comprehension: "Comprensión",
    application: "Aplicación",
    clarity: "Claridad",
  };
  $("rubric-mode").textContent =
    data.rubric.evaluation_mode === "hybrid_model"
      ? "Modelo + conceptos"
      : "Fallback determinista";
  $("rubric-scores").innerHTML = Object.entries(rubricLabels)
    .map(([key, label]) => {
      const criterion = data.rubric[key];
      return `<article>
        <div><strong>${escapeHtml(label)}</strong><span>${criterion.score}/4</span></div>
        <p>${escapeHtml(criterion.explanation)}</p>
      </article>`;
    })
    .join("");
  $("learning-context").textContent = data.learning_context;
  $("quiz-kicker").textContent = "Feedback personalizado";
  $("quiz-step").textContent = `Ronda ${data.attempt} completada`;
  $("question").classList.add("hidden");
  quizForm.classList.add("hidden");
  $("feedback").classList.remove("hidden");
  $("feedback").scrollIntoView({ behavior: "smooth", block: "center" });
}

function appendMessage(role, label, text, sources = [], note = "") {
  $("welcome").classList.add("hidden");
  const article = document.createElement("article");
  article.className = `chat-message ${role}`;
  const avatar = role === "user" ? "Tú" : label.charAt(0);
  article.innerHTML = `
    <div class="chat-avatar">${escapeHtml(avatar)}</div>
    <div class="message-body">
      <div class="message-label">${escapeHtml(label)}</div>
      <div class="message-content">${renderMarkdown(text)}</div>
      ${sources.length ? `<div class="sources">${sources.map((source) => `<span>↗ ${escapeHtml(source)}</span>`).join("")}</div>` : ""}
      ${note ? `<div class="message-note">${escapeHtml(note)}</div>` : ""}
    </div>`;
  const feed = $("conversation-feed");
  feed.appendChild(article);
  feed.scrollTop = feed.scrollHeight;
}

function renderProgress(progress) {
  const topics = progress.topic_progress || [];
  const totalTopics = state.catalogTotal;
  const completion = totalTopics
    ? Math.min(100, (state.catalogCompleted / totalTopics) * 100)
    : 0;
  const average = topics.length
    ? Math.round(topics.reduce((sum, item) => sum + item.best_score, 0) / topics.length)
    : null;
  $("progress-bar").style.width = `${completion}%`;
  $("score-orb").textContent = average === null ? "—" : average;
  const count = totalTopics
    ? `${state.catalogCompleted} de ${totalTopics} temas completados`
    : `${topics.length} temas evaluados`;
  $("progress-copy").textContent =
    `${count} · Resumen global ${levelLabel(progress.level)}`;
  $("studied-topics").innerHTML = topics.length
    ? topics.map(renderTopicMastery).join("")
    : '<p class="empty-progress">Aún no hay evaluaciones por tema.</p>';
}

function renderTopicMastery(item) {
  const mastered = item.mastered_concepts || [];
  const pending = item.pending_concepts || [];
  return `
    <article class="topic-mastery ${item.mastery_status}">
      <div class="topic-mastery-heading">
        <div>
          <strong>${escapeHtml(topicTitle(item.topic))}</strong>
          <span>${item.attempts} ${item.attempts === 1 ? "intento" : "intentos"} · mejor ${Math.round(item.best_score)}/100</span>
        </div>
        <em>${escapeHtml(levelLabel(item.level))}</em>
      </div>
      <div class="mastery-state">
        ${item.mastery_status === "mastered" ? "✓ Dominado" : "En desarrollo"}
      </div>
      ${
        mastered.length
          ? `<div class="concept-group mastered-concepts">
              <small>Conceptos dominados</small>
              <div>${mastered.map((concept) => `<span>${escapeHtml(conceptLabel(concept))}</span>`).join("")}</div>
            </div>`
          : ""
      }
      ${
        pending.length
          ? `<div class="concept-group pending-concepts">
              <small>Conceptos pendientes</small>
              <div>${pending.map((concept) => `<span>${escapeHtml(conceptLabel(concept))}</span>`).join("")}</div>
            </div>`
          : ""
      }
      ${
        !mastered.length && !pending.length
          ? '<p class="legacy-progress">Registro anterior: el detalle por concepto comenzará con el próximo intento.</p>'
          : ""
      }
    </article>`;
}

function renderTrace() {
  const container = $("trace");
  if (!state.trace.length) {
    container.className = "trace empty";
    container.innerHTML = "<p>Los eventos aparecerán aquí. No se muestra razonamiento interno.</p>";
    return;
  }
  const icons = { user_message: "U", decision: "D", delegation: "A", tool_call: "M", model_call: "G", response: "✓", error: "!" };
  container.className = "trace";
  container.innerHTML = state.trace.map((event) => `
    <article class="trace-event">
      <span class="trace-icon">${icons[event.kind] || "·"}</span>
      <div class="trace-main">
        <strong>${escapeHtml(event.actor)} · ${escapeHtml(event.action)}</strong>
        <p>${escapeHtml(event.summary)}</p>
      </div>
      <span class="trace-time">${event.duration_ms ? `${Math.round(event.duration_ms)} ms` : ""}</span>
    </article>`).join("");
}

function setBusy(busy) {
  $("send").disabled = busy;
  $("send").querySelector("span").textContent = busy ? "Coordinando…" : "Enviar";
  document.querySelectorAll("[data-start-topic]").forEach((button) => {
    button.disabled = busy;
  });
}

function showError(message) {
  $("error").textContent = message;
  $("error").classList.toggle("hidden", !message);
}

function pretty(value) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function conceptLabel(value) {
  const text = String(value).replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function topicTitle(topic) {
  return state.catalog.find((item) => item.topic === topic)?.title || pretty(topic);
}

function levelLabel(level) {
  return { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" }[level] || level;
}

function categoryLabel(category) {
  return {
    fundamentos: "Fundamentos",
    "modelos-y-datos": "Modelos y datos",
    "agentes-y-herramientas": "Agentes y herramientas",
    "calidad-y-seguridad": "Calidad y seguridad",
    produccion: "Producción",
  }[category] || category;
}

function topicStatusLabel(status) {
  return {
    blocked: "Bloqueado",
    available: "Disponible",
    in_progress: "En progreso",
    completed: "✓ Completado",
  }[status] || status;
}

function topicActionLabel(status) {
  return {
    blocked: "Estudiar de todos modos",
    available: "Comenzar tema",
    in_progress: "Continuar tema",
    completed: "Repasar tema",
  }[status] || "Abrir tema";
}

function renderMarkdown(value) {
  const lines = String(value).replace(/\r\n?/g, "\n").trim().split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let codeLanguage = "";
  let codeLines = null;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type) => {
    closeParagraph();
    if (listType === type) return;
    closeList();
    listType = type;
    output.push(`<${type}>`);
  };
  const closeCode = () => {
    const language = /^[a-z0-9_-]+$/i.test(codeLanguage)
      ? ` data-language="${escapeHtml(codeLanguage)}"`
      : "";
    output.push(
      `<pre><code${language}>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    );
    codeLines = null;
    codeLanguage = "";
  };

  lines.forEach((line) => {
    const fence = line.match(/^```\s*([a-z0-9_-]*)\s*$/i);
    if (fence) {
      if (codeLines) closeCode();
      else {
        closeParagraph();
        closeList();
        codeLanguage = fence[1] || "";
        codeLines = [];
      }
      return;
    }
    if (codeLines) {
      codeLines.push(line);
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeParagraph();
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length + 2;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const unordered = trimmed.match(/^[-+*]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      output.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      return;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      openList("ol");
      output.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      return;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      closeParagraph();
      closeList();
      output.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      return;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeParagraph();
      closeList();
      output.push("<hr>");
      return;
    }

    paragraph.push(trimmed);
  });

  if (codeLines) closeCode();
  closeParagraph();
  closeList();
  return output.join("");
}

function renderInlineMarkdown(value) {
  const inlineCode = [];
  let safe = escapeHtml(value).replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `@@INLINE_CODE_${inlineCode.length}@@`;
    inlineCode.push(`<code>${code}</code>`);
    return token;
  });
  safe = safe
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  return safe.replace(
    /@@INLINE_CODE_(\d+)@@/g,
    (_, index) => inlineCode[Number(index)],
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
