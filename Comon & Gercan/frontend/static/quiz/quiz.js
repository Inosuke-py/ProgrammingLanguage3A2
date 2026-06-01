const questions = JSON.parse(document.getElementById("quiz-data").textContent);
const timeLimit = Number(JSON.parse(document.getElementById("quiz-time-limit").textContent)) || 5;
const sessionConfig = window.quizSessionConfig || {};

let current = 0;
let answers = Array(questions.length).fill(null);
let locked = Array(questions.length).fill(false);
let remaining = Array(questions.length).fill(timeLimit);
let timerId = null;
let startedAt = Date.now();
let submitted = false;

const progressLabel = document.getElementById("progressLabel");
const questionTopic = document.getElementById("questionTopic");
const progressBar = document.getElementById("progressBar");
const questionPrompt = document.getElementById("questionPrompt");
const choices = document.getElementById("choices");
const feedback = document.getElementById("feedback");
const scoreBadge = document.getElementById("scoreBadge");
const timerBadge = document.getElementById("timerBadge");
const answeredCount = document.getElementById("answeredCount");
const accuracy = document.getElementById("accuracy");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");

function score() {
    return answers.reduce((total, answer, index) => {
        return total + (isCorrect(questions[index], answer) ? 1 : 0);
    }, 0);
}

function answered() {
    return answers.filter((answer) => answer !== null && answer !== "").length;
}

function updateStats() {
    const answeredTotal = answered();
    const currentScore = score();
    scoreBadge.textContent = `Score ${currentScore}`;
    answeredCount.textContent = answeredTotal;
    accuracy.textContent = answeredTotal ? `${Math.round((currentScore / answeredTotal) * 100)}%` : "0%";
}

function renderFeedback(question, selected) {
    if (selected === null || selected === "") {
        feedback.className = locked[current]
            ? "mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"
            : "mt-5 hidden rounded-lg border p-4 text-sm leading-6";
        feedback.textContent = locked[current] ? "Time expired. This question is locked with no answer selected." : "";
        return;
    }

    const correct = isCorrect(question, selected);
    feedback.className = `mt-5 rounded-lg border p-4 text-sm leading-6 ${
        correct
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
    }`;
    feedback.textContent = `${correct ? "Correct." : "Not quite."} ${question.explanation || ""}`;
}

function renderQuestion() {
    const question = questions[current];
    const selected = answers[current];
    const progress = ((current + 1) / questions.length) * 100;

    progressLabel.textContent = `Question ${current + 1} of ${questions.length}${locked[current] ? " · Locked" : ""}`;
    questionTopic.textContent = question.topic;
    progressBar.style.width = `${progress}%`;
    questionPrompt.textContent = question.prompt;
    timerBadge.textContent = locked[current] ? "Locked" : `${remaining[current]}s`;
    choices.innerHTML = "";

    if ((question.type || "mcq") === "short_answer") {
        renderShortAnswer(question, selected);
    } else {
        renderChoiceQuestion(question, selected);
    }

    prevBtn.disabled = current === 0;
    prevBtn.classList.toggle("opacity-50", current === 0);
    nextBtn.textContent = current === questions.length - 1 ? "Finish" : "Next";
    renderFeedback(question, selected);
    updateStats();
    startTimer();
}

function startTimer() {
    clearInterval(timerId);
    if (locked[current] || submitted) {
        return;
    }

    timerId = setInterval(() => {
        remaining[current] -= 1;
        timerBadge.textContent = `${Math.max(remaining[current], 0)}s`;
        if (remaining[current] <= 0) {
            lockCurrentQuestion();
            advanceOrFinish();
        }
    }, 1000);
}

function lockCurrentQuestion() {
    locked[current] = true;
    clearInterval(timerId);
}

function advanceOrFinish() {
    if (current < questions.length - 1) {
        current += 1;
        renderQuestion();
    } else {
        finishQuiz();
    }
}

prevBtn.addEventListener("click", () => {
    if (current > 0) {
        current -= 1;
        renderQuestion();
    }
});

nextBtn.addEventListener("click", () => {
    lockCurrentQuestion();
    advanceOrFinish();
});

resetBtn.addEventListener("click", () => {
    answers = Array(questions.length).fill(null);
    locked = Array(questions.length).fill(false);
    remaining = Array(questions.length).fill(timeLimit);
    current = 0;
    submitted = false;
    startedAt = Date.now();
    renderQuestion();
});

renderQuestion();

function renderChoiceQuestion(question, selected) {
    question.choices.forEach((choice, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rounded-lg border border-zinc-200 bg-white p-4 text-left text-sm font-medium leading-6 text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-75";
        button.textContent = choice;
        button.disabled = locked[current] || submitted;

        if (selected !== null) {
            if (index === Number(question.answer)) {
                button.classList.add("choice-correct");
            } else if (index === selected) {
                button.classList.add("choice-wrong");
            }
        }

        button.addEventListener("click", () => {
            if (locked[current] || submitted) {
                return;
            }
            answers[current] = index;
            renderQuestion();
        });
        choices.appendChild(button);
    });
}

function renderShortAnswer(question, selected) {
    const wrapper = document.createElement("div");
    wrapper.className = "grid gap-3";

    const input = document.createElement("input");
    input.type = "text";
    input.value = selected || "";
    input.placeholder = "Type your answer";
    input.disabled = locked[current] || submitted;
    input.className = "block w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100";
    input.addEventListener("input", () => {
        if (locked[current] || submitted) {
            return;
        }
        answers[current] = input.value;
        updateStats();
    });

    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.disabled = locked[current] || submitted;
    checkButton.className = "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-75";
    checkButton.textContent = "Check answer";
    checkButton.addEventListener("click", () => {
        if (locked[current] || submitted) {
            return;
        }
        answers[current] = input.value;
        renderQuestion();
    });

    wrapper.appendChild(input);
    wrapper.appendChild(checkButton);
    choices.appendChild(wrapper);
}

function finishQuiz() {
    if (submitted) {
        return;
    }
    submitted = true;
    locked = locked.map(() => true);
    clearInterval(timerId);
    renderQuestion();

    const completionTime = Math.round((Date.now() - startedAt) / 1000);
    const payload = {
        completion_time_seconds: completionTime,
        details: buildAttemptDetails(),
    };

    if (!sessionConfig.canSubmit) {
        showFinalMessage(`Finished preview. Score ${score()} out of ${questions.length}.`);
        return;
    }

    fetch(sessionConfig.submitUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": sessionConfig.csrfToken,
        },
        body: JSON.stringify(payload),
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Attempt could not be saved.");
            }
            return response.json();
        })
        .then((result) => {
            showFinalMessage(`Finished. You scored ${result.score} out of ${result.total} (${result.percentage}%). Status: ${result.passed ? "Passed" : "Failed"}.`);
        })
        .catch(() => {
            showFinalMessage(`Finished. You scored ${score()} out of ${questions.length}, but the result could not be saved.`);
        });
}

function showFinalMessage(message) {
    feedback.className = "mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800";
    feedback.textContent = message;
    updateStats();
}

function buildAttemptDetails() {
    return questions.map((question, index) => {
        const selected = answers[index];
        return {
            question_index: index,
            prompt: question.prompt,
            selected_answer: selected,
            selected_label: answerLabel(question, selected),
            correct_answer: question.answer,
            correct_label: answerLabel(question, question.answer),
            correct: isCorrect(question, selected),
            time_limit_seconds: timeLimit,
            timed_out: remaining[index] <= 0 && (selected === null || selected === ""),
        };
    });
}

function answerLabel(question, value) {
    if (value === null || value === "") {
        return "";
    }
    if ((question.type || "mcq") === "short_answer") {
        return String(value);
    }
    return question.choices[Number(value)] || "";
}

function isCorrect(question, selected) {
    if (selected === null || selected === "") {
        return false;
    }
    if ((question.type || "mcq") === "short_answer") {
        return normalizeAnswer(selected).includes(normalizeAnswer(question.answer));
    }
    return Number(selected) === Number(question.answer);
}

function normalizeAnswer(value) {
    return String(value || "").trim().toLowerCase();
}
