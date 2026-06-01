const builderConfig = window.quizBuilderConfig;
let builderQuestions = [];

const tabs = document.querySelectorAll(".builder-tab");
const panels = document.querySelectorAll(".tab-panel");
const pdfImportForm = document.getElementById("pdfImportForm");
const pdfFile = document.getElementById("pdfFile");
const pdfTitle = document.getElementById("pdfTitle");
const pdfQuestionCount = document.getElementById("pdfQuestionCount");
const importPdfBtn = document.getElementById("importPdfBtn");
const importBtnText = document.getElementById("importBtnText");
const importSpinner = document.getElementById("importSpinner");
const pdfMessage = document.getElementById("pdfMessage");
const questionBuilder = document.getElementById("questionBuilder");
const builderSummary = document.getElementById("builderSummary");
const addQuestionBtn = document.getElementById("addQuestionBtn");
const clearBuilderBtn = document.getElementById("clearBuilderBtn");
const publishBuilderBtn = document.getElementById("publishBuilderBtn");

tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        tabs.forEach((item) => {
            item.classList.remove("active-tab", "border-emerald-600", "text-emerald-700");
            item.classList.add("border-transparent");
        });
        panels.forEach((panel) => panel.classList.add("hidden"));
        tab.classList.add("active-tab", "border-emerald-600", "text-emerald-700");
        tab.classList.remove("border-transparent");
        document.getElementById(tab.dataset.tab).classList.remove("hidden");
    });
});

function showMessage(message, type = "info") {
    pdfMessage.className = `mt-4 rounded-lg border p-3 text-sm leading-6 ${
        type === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
    }`;
    pdfMessage.textContent = message;
}

function setLoading(isLoading) {
    importPdfBtn.disabled = isLoading;
    importPdfBtn.classList.toggle("opacity-70", isLoading);
    importBtnText.textContent = isLoading ? "Extracting text..." : "Generate from PDF";
    importSpinner.classList.toggle("hidden", !isLoading);
}

function newQuestion(type = "mcq") {
    if (type === "true_false") {
        return {
            type,
            prompt: "True or False: ",
            choices: ["True", "False"],
            answer: 0,
            explanation: "",
        };
    }
    if (type === "short_answer") {
        return {
            type,
            prompt: "",
            choices: [],
            answer: "",
            explanation: "",
        };
    }
    return {
        type: "mcq",
        prompt: "",
        choices: ["", "", "", ""],
        answer: 0,
        explanation: "",
    };
}

function renderBuilder() {
    questionBuilder.innerHTML = "";
    builderSummary.textContent = builderQuestions.length
        ? `${builderQuestions.length} editable question${builderQuestions.length === 1 ? "" : "s"} ready.`
        : "Import a PDF to generate editable draft questions.";

    builderQuestions.forEach((question, index) => {
        const card = document.createElement("article");
        card.className = "rounded-lg border border-zinc-200 bg-zinc-50 p-4";
        card.innerHTML = questionTemplate(question, index);
        questionBuilder.appendChild(card);
    });

    bindBuilderControls();
}

function questionTemplate(question, index) {
    const choices = question.type === "mcq"
        ? question.choices.map((choice, choiceIndex) => `
            <div class="flex gap-2">
                <input type="radio" name="answer-${index}" ${Number(question.answer) === choiceIndex ? "checked" : ""} data-index="${index}" data-answer="${choiceIndex}" class="mt-3 h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500">
                <input value="${escapeHtml(choice)}" data-index="${index}" data-choice="${choiceIndex}" class="choice-input block w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-emerald-500">
            </div>
        `).join("")
        : "";

    const answerControl = question.type === "true_false"
        ? `
            <select data-index="${index}" class="answer-input block w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-emerald-500">
                <option value="0" ${Number(question.answer) === 0 ? "selected" : ""}>True</option>
                <option value="1" ${Number(question.answer) === 1 ? "selected" : ""}>False</option>
            </select>
        `
        : question.type === "short_answer"
            ? `<input value="${escapeHtml(question.answer || "")}" data-index="${index}" class="answer-input block w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-emerald-500">`
            : "";

    return `
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-sm font-semibold text-zinc-950">Question ${index + 1}</h3>
            <div class="flex gap-2">
                <select data-index="${index}" class="type-input rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900">
                    <option value="mcq" ${question.type === "mcq" ? "selected" : ""}>MCQ</option>
                    <option value="true_false" ${question.type === "true_false" ? "selected" : ""}>True/False</option>
                    <option value="short_answer" ${question.type === "short_answer" ? "selected" : ""}>Short answer</option>
                </select>
                <button type="button" data-delete="${index}" class="delete-question rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Delete</button>
            </div>
        </div>
        <label class="mb-2 block text-sm font-medium text-zinc-900">Prompt</label>
        <textarea data-index="${index}" class="prompt-input mb-4 block min-h-24 w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-emerald-500">${escapeHtml(question.prompt)}</textarea>
        ${question.type === "mcq" ? `<div class="mb-4 grid gap-2"><label class="text-sm font-medium text-zinc-900">Choices and correct answer</label>${choices}</div>` : ""}
        ${question.type !== "mcq" ? `<div class="mb-4"><label class="mb-2 block text-sm font-medium text-zinc-900">Correct answer</label>${answerControl}</div>` : ""}
        <label class="mb-2 block text-sm font-medium text-zinc-900">Explanation</label>
        <textarea data-index="${index}" class="explanation-input block min-h-20 w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-emerald-500">${escapeHtml(question.explanation || "")}</textarea>
    `;
}

function bindBuilderControls() {
    document.querySelectorAll(".type-input").forEach((input) => {
        input.addEventListener("change", () => {
            builderQuestions[Number(input.dataset.index)] = newQuestion(input.value);
            renderBuilder();
        });
    });
    document.querySelectorAll(".prompt-input").forEach((input) => {
        input.addEventListener("input", () => builderQuestions[Number(input.dataset.index)].prompt = input.value);
    });
    document.querySelectorAll(".explanation-input").forEach((input) => {
        input.addEventListener("input", () => builderQuestions[Number(input.dataset.index)].explanation = input.value);
    });
    document.querySelectorAll(".choice-input").forEach((input) => {
        input.addEventListener("input", () => {
            builderQuestions[Number(input.dataset.index)].choices[Number(input.dataset.choice)] = input.value;
        });
    });
    document.querySelectorAll("[data-answer]").forEach((input) => {
        input.addEventListener("change", () => builderQuestions[Number(input.dataset.index)].answer = Number(input.dataset.answer));
    });
    document.querySelectorAll(".answer-input").forEach((input) => {
        input.addEventListener("input", () => {
            const question = builderQuestions[Number(input.dataset.index)];
            question.answer = question.type === "true_false" ? Number(input.value) : input.value;
        });
    });
    document.querySelectorAll(".delete-question").forEach((button) => {
        button.addEventListener("click", () => {
            builderQuestions.splice(Number(button.dataset.delete), 1);
            renderBuilder();
        });
    });
}

pdfImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = pdfFile.files[0];
    if (!file) {
        showMessage("Choose a PDF file first.", "error");
        return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        showMessage("Only PDF files are supported.", "error");
        return;
    }
    if (file.size > 8 * 1024 * 1024) {
        showMessage("PDF must be 8 MB or smaller.", "error");
        return;
    }

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("count", pdfQuestionCount.value || "8");

    setLoading(true);
    try {
        const response = await fetch(builderConfig.importUrl, {
            method: "POST",
            headers: {"X-CSRFToken": builderConfig.csrfToken},
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "PDF import failed.");
        }
        builderQuestions = data.questions;
        pdfTitle.value = `${data.title} Quiz`;
        renderBuilder();
        showMessage(`Generated ${data.questions.length} draft questions from about ${data.word_count} words.`);
    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        setLoading(false);
    }
});

addQuestionBtn.addEventListener("click", () => {
    builderQuestions.push(newQuestion());
    renderBuilder();
});

clearBuilderBtn.addEventListener("click", () => {
    builderQuestions = [];
    renderBuilder();
});

publishBuilderBtn.addEventListener("click", async () => {
    if (!builderQuestions.length) {
        showMessage("Add or import at least one question before saving.", "error");
        return;
    }

    try {
        const response = await fetch(builderConfig.saveUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": builderConfig.csrfToken,
            },
            body: JSON.stringify({
                title: pdfTitle.value,
                questions: builderQuestions,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Could not save quiz.");
        }
        window.location.href = data.redirect_url;
    } catch (error) {
        showMessage(error.message, "error");
    }
});

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

renderBuilder();
