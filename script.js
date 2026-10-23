// Application State Variables
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let userAnswers = [];
let db = null;

// Initialize Browser Database & Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  initBrowserDatabase();

  document.getElementById("copy-btn").addEventListener("click", copyPrompt);
  document.getElementById("sample-btn").addEventListener("click", loadSample);
  document.getElementById("start-btn").addEventListener("click", parseInputAndStart);
  document.getElementById("reset-btn").addEventListener("click", resetQuiz);
  document.getElementById("clear-db-btn").addEventListener("click", clearDatabaseHistory);
});

// 1. CLIENT-SIDE DATABASE ENGINE (IndexedDB)
function initBrowserDatabase() {
  const request = indexedDB.open("QuizSprintDB", 1);

  request.onupgradeneeded = (event) => {
    db = event.target.result;

    // Create 'quizzes' table/store
    if (!db.objectStoreNames.contains("quizzes")) {
      db.createObjectStore("quizzes", { keyPath: "id", autoIncrement: true });
    }

    // Create 'history' table/store
    if (!db.objectStoreNames.contains("history")) {
      db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
    }
  };

  request.onsuccess = (event) => {
    db = event.target.result;
    console.log("QuizSprintDB initialized successfully.");
  };

  request.onerror = (event) => {
    console.error("Database initialization error:", event.target.error);
  };
}

// Save Completed Attempt to DB Table 'history'
function saveScoreToDatabase(scoreCount, totalQuestions, percentage) {
  if (!db) return;

  const transaction = db.transaction(["history"], "readwrite");
  const historyStore = transaction.objectStore("history");

  const attemptRecord = {
    timestamp: new Date().toLocaleString(),
    score: `${scoreCount} / ${totalQuestions}`,
    accuracy: `${percentage}%`
  };

  historyStore.add(attemptRecord);

  transaction.oncomplete = () => {
    loadDatabaseHistoryUI();
  };
}

// Retrieve Records from DB Table 'history' & Render Table Rows
function loadDatabaseHistoryUI() {
  if (!db) return;

  const transaction = db.transaction(["history"], "readonly");
  const historyStore = transaction.objectStore("history");
  const request = historyStore.getAll();

  request.onsuccess = () => {
    const records = request.result;
    const tbody = document.getElementById("db-history-rows");
    tbody.innerHTML = "";

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">No past records found in database.</td></tr>`;
      return;
    }

    // Render most recent attempts at the top
    records.reverse().slice(0, 5).forEach(record => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${record.timestamp}</td>
        <td><strong>${record.score}</strong></td>
        <td>${record.accuracy}</td>
      `;
      tbody.appendChild(row);
    });
  };
}

// Clear History Table in DB
function clearDatabaseHistory() {
  if (!db) return;
  const transaction = db.transaction(["history"], "readwrite");
  const historyStore = transaction.objectStore("history");
  historyStore.clear();

  transaction.oncomplete = () => {
    loadDatabaseHistoryUI();
  };
}

// 2. REGULAR APP LOGIC & TEXT PARSING
function copyPrompt() {
  const promptText = document.getElementById("ai-prompt").innerText;
  navigator.clipboard.writeText(promptText).then(() => {
    alert("AI Prompt copied to clipboard!");
  });
}

function loadSample() {
  const sampleText = `1. What is the primary focus when converting an Entity-Relationship (ER) diagram into a relational schema?
A) Writing SQL scripts to create views
B) Converting entities into tables, attributes into columns, and relationships into foreign keys
C) Designing the physical user interface for data entry
D) Developing algorithms for automated data processing

2. Which rule governs the conversion of an entity's key attribute into a relational database table?
A) It becomes a foreign key pointing to an external table
B) It becomes an alternate candidate key in a linking table
C) It becomes the primary key of that table
D) It is discarded during the conceptual-to-relational conversion

3. In a one-to-many relationship, where should the foreign key be placed?
A) On the "one" side of the relationship
B) On the "many" side of the relationship
C) In a newly created third table
D) On both tables simultaneously

ANSWERS:
1. B
2. C
3. B`;

  document.getElementById("quiz-input").value = sampleText;
}

function parseInputAndStart() {
  const rawText = document.getElementById("quiz-input").value.trim();
  if (!rawText) {
    alert("Please paste your formatted questions and answer key first!");
    return;
  }

  const parts = rawText.split(/ANSWERS:/i);
  if (parts.length < 2) {
    alert("Missing 'ANSWERS:' section at the bottom of your text!");
    return;
  }

  const questionBlock = parts[0].trim();
  const answerBlock = parts[1].trim();

  const answerKey = {};
  const answerLines = answerBlock.split("\n");
  answerLines.forEach(line => {
    const match = line.match(/(\d+)[\.\s:\-]+([A-D])/i);
    if (match) {
      answerKey[match[1]] = match[2].toUpperCase();
    }
  });

  questions = [];
  userAnswers = [];
  // RegEx split supporting up to 100+ questions
  const rawQuestions = questionBlock.split(/(?=\b\d{1,3}[\.\)])/g);

  rawQuestions.forEach(qText => {
    const lines = qText.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 3) return;

    const qHeaderMatch = lines[0].match(/^(\d+)[\.\)]\s*(.+)/);
    if (!qHeaderMatch) return;

    const qNum = qHeaderMatch[1];
    const qTitle = qHeaderMatch[2];
    const optionsObj = {};
    const choicesList = [];

    for (let i = 1; i < lines.length; i++) {
      const optMatch = lines[i].match(/^([A-D])[\.\)]\s*(.+)/i);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase();
        const optionText = optMatch[2];
        optionsObj[letter] = optionText;
        choicesList.push(optionText);
      }
    }

    const correctLetter = answerKey[qNum];
    const correctText = optionsObj[correctLetter];

    if (correctText && choicesList.length >= 2) {
      questions.push({
        num: qNum,
        question: qTitle,
        choices: choicesList,
        correct: correctText
      });
    }
  });

  if (questions.length === 0) {
    alert("Could not parse any valid questions. Please check your formatting!");
    return;
  }

  // Cap max questions at 100 if user inputs more
  if (questions.length > 100) {
    alert("Loading first 100 questions for optimal browser memory performance.");
    questions = questions.slice(0, 100);
  }

  currentQuestionIndex = 0;
  score = 0;
  document.getElementById("setup-screen").classList.add("hidden");
  document.getElementById("quiz-screen").classList.remove("hidden");

  loadQuestion();
}

function loadQuestion() {
  const q = questions[currentQuestionIndex];

  document.getElementById("progress-text").textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
  document.getElementById("score-tracker").textContent = `Score: ${score}`;
  document.getElementById("question-text").textContent = `${q.num}. ${q.question}`;

  const container = document.getElementById("options-container");
  container.innerHTML = "";

  q.choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = choice;
    btn.onclick = () => selectAnswer(choice);
    container.appendChild(btn);
  });
}

function selectAnswer(selectedChoice) {
  const q = questions[currentQuestionIndex];
  const isCorrect = selectedChoice === q.correct;

  if (isCorrect) score++;

  userAnswers.push({
    question: q.question,
    selected: selectedChoice,
    correct: q.correct,
    isCorrect: isCorrect
  });

  currentQuestionIndex++;

  if (currentQuestionIndex < questions.length) {
    loadQuestion();
  } else {
    showResults();
  }
}

function showResults() {
  document.getElementById("quiz-screen").classList.add("hidden");
  document.getElementById("result-screen").classList.remove("hidden");

  const percentage = Math.round((score / questions.length) * 100);
  document.getElementById("final-score").textContent = `${score} / ${questions.length}`;
  document.getElementById("final-percentage").textContent = `${percentage}% Accuracy`;

  // 3. PERSIST SCORE TO CLIENT-SIDE BROWSER DATABASE
  saveScoreToDatabase(score, questions.length, percentage);

  // Render Review Items
  const reviewContainer = document.getElementById("review-container");
  reviewContainer.innerHTML = "";

  userAnswers.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = `review-item ${item.isCorrect ? 'correct-item' : 'incorrect-item'}`;

    div.innerHTML = `
      <div class="review-q">${index + 1}. ${item.question}</div>
      <div class="review-ans">Your answer: <strong>${item.selected}</strong> ${item.isCorrect ? '✓' : '✗'}</div>
      ${!item.isCorrect ? `<div class="review-ans" style="color: var(--success); margin-top:2px;">Correct answer: <strong>${item.correct}</strong></div>` : ''}
    `;

    reviewContainer.appendChild(div);
  });
}

function resetQuiz() {
  document.getElementById("result-screen").classList.add("hidden");
  document.getElementById("setup-screen").classList.remove("hidden");
}