// ==========================================
// QuizForge AI - Frontend JavaScript
// ==========================================

const pdfInput = document.getElementById("pdfInput");
const dropZone = document.getElementById("dropZone");
const selectedFile = document.getElementById("selectedFile");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const removeFile = document.getElementById("removeFile");
const generateBtn = document.getElementById("generateBtn");
const questionCount = document.getElementById("questionCount");
const difficulty = document.getElementById("difficulty");
const statusMessage = document.getElementById("statusMessage");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const API_BASE_URL =
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? "http://localhost:8080"
        : "https://quizforge-ai-backend.onrender.com";

let currentFile = null;
let generatedQuestions = [];

let quizStartTime = null;
let quizEndTime = null;
let quizTimerInterval = null;
let quizTimeTaken = 0;
let quizSubmitted = false;
let quizScore = 0;

// Store the user's answers for PDF generation.
let userAnswers = [];

// ==========================================
// Status Message
// ==========================================

function showStatus(message) {
    statusMessage.textContent = message;
}

// ==========================================
// File Utilities
// ==========================================

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isPdf(file) {
    return file.name.toLowerCase().endsWith(".pdf") &&
        (file.type === "application/pdf" || file.type === "");
}

function resetFile() {
    currentFile = null;
    pdfInput.value = "";

    selectedFile.hidden = true;
    fileName.textContent = "";
    fileSize.textContent = "";
}

function handleFile(file) {
    if (!file) {
        return;
    }

    if (!isPdf(file)) {
        resetFile();
        showStatus("Please select a valid PDF file.");
        return;
    }

    if (file.size === 0) {
        resetFile();
        showStatus("The selected PDF is empty.");
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        resetFile();
        showStatus("File size exceeds 10 MB. Choose a smaller PDF.");
        return;
    }

    currentFile = file;

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    selectedFile.hidden = false;

    showStatus("PDF selected successfully. You're ready to generate a quiz.");
}

// ==========================================
// File Selection
// ==========================================

pdfInput.addEventListener("change", () => {
    handleFile(pdfInput.files[0]);
});

removeFile.addEventListener("click", () => {
    resetFile();
    showStatus("PDF removed. Select another file.");
});

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");

    const file = event.dataTransfer.files[0];

    if (file) {
        handleFile(file);
    }
});

// ==========================================
// Parse Backend Quiz Response
// ==========================================

function parseQuizResponse(responseData) {
    let result = responseData.result ?? responseData;

    if (typeof result === "string") {
        result = result.trim();

        result = result
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/, "");

        result = JSON.parse(result);
    }

    // Support Gemini-style responses if needed.
    if (!Array.isArray(result.questions) &&
        Array.isArray(result.candidates)) {

        const candidateText =
            result.candidates[0]?.content?.parts?.[0]?.text;

        if (candidateText) {
            result = JSON.parse(
                candidateText
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/i, "")
                    .replace(/\s*```$/, "")
            );
        }
    }

    if (!Array.isArray(result.questions)) {
        throw new Error(
            "The AI response does not contain a questions array."
        );
    }

    return result.questions;
}

// ==========================================
// Generate Quiz
// ==========================================

generateBtn.addEventListener("click", generateQuiz);

async function generateQuiz() {
    if (!currentFile) {
        showStatus("Please upload a PDF before generating your quiz.");
        return;
    }

    const count = Number(questionCount.value);
    const level = difficulty.value;

    generateBtn.disabled = true;
    generateBtn.textContent = "Generating your quiz...";

    showStatus("Step 1 of 2: Extracting text from your PDF...");

    const oldQuiz = document.getElementById("quizContainer");

    if (oldQuiz) {
        oldQuiz.remove();
    }

    // Stop any timer belonging to an earlier quiz.
    clearInterval(quizTimerInterval);
    quizTimerInterval = null;
    quizStartTime = null;
    quizSubmitted = false;

    try {
        // STEP 1: Extract PDF text.
        const formData = new FormData();
        formData.append("file", currentFile);

        const pdfResponse = await fetch(
            `${API_BASE_URL}/api/pdf/extract`,
            {
                method: "POST",
                body: formData
            }
        );

        const pdfData = await pdfResponse.json();

        if (!pdfResponse.ok) {
            throw new Error(
                pdfData.error || "Could not extract text from the PDF."
            );
        }

        if (!pdfData.text || !pdfData.text.trim()) {
            throw new Error(
                "No readable text was found in this PDF. " +
                "Try a text-based PDF instead of a scanned document."
            );
        }

        showStatus("Step 2 of 2: AI is generating your questions...");

        // STEP 2: Generate quiz using Spring Boot.
        const quizResponse = await fetch(
            `${API_BASE_URL}/api/quiz/generate`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: pdfData.text,
                    numberOfQuestions: count,
                    difficulty: level
                })
            }
        );

        const quizData = await quizResponse.json();

        if (!quizResponse.ok) {
            throw new Error(
                quizData.error || "Quiz generation failed."
            );
        }

        generatedQuestions = parseQuizResponse(quizData);

        if (generatedQuestions.length === 0) {
            throw new Error("The AI did not generate any questions.");
        }

        // Display quiz first.
        displayQuiz(generatedQuestions);

        // Start the timer when questions become available.
        startQuizTimer();

        showStatus(
            `Success! ${generatedQuestions.length} questions generated.`
        );

        document.getElementById("quizContainer").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        console.error("Quiz generation error:", error);

        showStatus(
            "Error: " + error.message +
            " Check that Spring Boot is running in Eclipse."
        );

    } finally {
        generateBtn.disabled = false;

        generateBtn.innerHTML =
            '<span class="generate-icon">✦</span>' +
            'Generate My Quiz' +
            '<span class="generate-arrow">→</span>';
    }
}

// ==========================================
// Quiz Timer
// ==========================================

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${mm}:${ss}`;
    }

    return `${mm}:${ss}`;
}

function updateQuizTimer() {
    if (quizStartTime === null || quizSubmitted) {
        return;
    }

    const elapsedSeconds = Math.floor(
        (Date.now() - quizStartTime) / 1000
    );

    const timerDisplay = document.getElementById("quizTimer");

    if (timerDisplay) {
        timerDisplay.textContent = formatTime(elapsedSeconds);
    }
}

function startQuizTimer() {
    clearInterval(quizTimerInterval);

    quizStartTime = Date.now();
    quizEndTime = null;
    quizTimeTaken = 0;
    quizSubmitted = false;
    quizScore = 0;
    userAnswers = [];

    updateQuizTimer();

    quizTimerInterval = setInterval(updateQuizTimer, 1000);
}

function stopQuizTimer() {
    if (quizStartTime === null || quizSubmitted) {
        return quizTimeTaken;
    }

    quizEndTime = Date.now();

    quizTimeTaken = Math.floor(
        (quizEndTime - quizStartTime) / 1000
    );

    quizSubmitted = true;

    clearInterval(quizTimerInterval);
    quizTimerInterval = null;

    updateQuizTimer();

    return quizTimeTaken;
}

// ==========================================
// Display Interactive Quiz
// ==========================================

function displayQuiz(questions) {
    const quizContainer = document.createElement("section");

    quizContainer.id = "quizContainer";
    quizContainer.className = "quiz-container";

    // Quiz heading.
    const heading = document.createElement("div");
    heading.className = "section-heading";

    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "YOUR PRACTICE SESSION";

    const title = document.createElement("h2");
    title.textContent = "Test your knowledge.";

    const description = document.createElement("p");
    description.textContent =
        `${questions.length} questions · Select one answer for each question.`;

    heading.append(eyebrow, title, description);

    // Timer display.
    const timerBox = document.createElement("div");
    timerBox.className = "quiz-timer-box";

    const timerLabel = document.createElement("span");
    timerLabel.textContent = "TIME TAKEN";

    const timerDisplay = document.createElement("strong");
    timerDisplay.id = "quizTimer";
    timerDisplay.textContent = "00:00";

    timerBox.append(timerLabel, timerDisplay);

    // Quiz form.
    const form = document.createElement("form");
    form.id = "quizForm";

    questions.forEach((question, questionIndex) => {
        const card = document.createElement("article");
        card.className = "quiz-question-card";

        const questionTitle = document.createElement("h3");

        questionTitle.textContent =
            `${questionIndex + 1}. ${question.question || "Question"}`;

        card.appendChild(questionTitle);

        const options = Array.isArray(question.options)
            ? question.options
            : [];

        options.forEach((option, optionIndex) => {
            const label = document.createElement("label");
            label.className = "quiz-option";

            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `question-${questionIndex}`;
            radio.value = String(option);
            radio.required = true;

            const optionText = document.createElement("span");

            optionText.textContent =
                `${String.fromCharCode(65 + optionIndex)}. ${option}`;

            label.append(radio, optionText);
            card.appendChild(label);
        });

        const explanation = document.createElement("p");
        explanation.className = "quiz-explanation";
        explanation.hidden = true;

        card.appendChild(explanation);
        form.appendChild(card);
    });

    const submitButton = document.createElement("button");

    submitButton.type = "submit";
    submitButton.className = "generate-button";
    submitButton.textContent = "Submit Answers";

    form.appendChild(submitButton);

    const result = document.createElement("div");

    result.id = "quizResult";
    result.className = "quiz-result";
    result.hidden = true;

    // Append the heading only once.
    quizContainer.append(heading, timerBox, form, result);

    document.querySelector(".upload-section").appendChild(quizContainer);

    // ======================================
    // Submit Quiz and Calculate Score
    // ======================================

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        // Prevent duplicate submissions.
        if (quizSubmitted) {
            return;
        }

        // Stop the timer.
        stopQuizTimer();

        let score = 0;
        userAnswers = [];

        questions.forEach((question, questionIndex) => {
            const card = form.querySelectorAll(".quiz-question-card")[questionIndex];

            const selected = form.querySelector(
                `input[name="question-${questionIndex}"]:checked`
            );

            const selectedAnswer = selected
                ? selected.value.trim()
                : "";

            const correctAnswer = String(
                question.correctAnswer ?? ""
            ).trim();

            const isCorrect =
                selectedAnswer.toLowerCase() ===
                correctAnswer.toLowerCase();

            if (isCorrect) {
                score++;
            }

            userAnswers.push({
                question: question.question || "Question",
                options: Array.isArray(question.options)
                    ? question.options
                    : [],
                selectedAnswer: selectedAnswer || "Not answered",
                correctAnswer: correctAnswer || "Not provided",
                isCorrect: isCorrect,
                explanation: question.explanation || ""
            });

            // Disable options after submission.
            card.querySelectorAll("input").forEach((input) => {
                input.disabled = true;
            });

            const explanation = card.querySelector(".quiz-explanation");

            explanation.hidden = false;

            explanation.classList.add(
                isCorrect ? "answer-correct" : "answer-incorrect"
            );

            explanation.textContent =
                `${isCorrect ? "Correct!" : "Incorrect."} ` +
                `Correct answer: ${correctAnswer || "Not provided"}. ` +
                `${question.explanation || ""}`;
        });

        quizScore = score;

        const percentage = Math.round(
            (score / questions.length) * 100
        );

        submitButton.disabled = true;
        submitButton.textContent = "Answers Submitted";

        // Clear any old result content.
        result.replaceChildren();
        result.hidden = false;

        const resultTitle = document.createElement("h2");
        resultTitle.textContent = "Quiz completed!";

        const scoreText = document.createElement("p");

        scoreText.textContent =
            `Your score: ${score} / ${questions.length} (${percentage}%)`;

        const timeText = document.createElement("p");

        timeText.textContent =
            `Time taken: ${formatTime(quizTimeTaken)}`;

        const feedback = document.createElement("p");

        if (percentage >= 80) {
            feedback.textContent =
                "Excellent work! You know this material well.";
        } else if (percentage >= 50) {
            feedback.textContent =
                "Good effort! Review the explanations to improve.";
        } else {
            feedback.textContent =
                "Keep practicing! Review the correct answers and try again.";
        }

        // Download PDF button.
        const downloadButton = document.createElement("button");

        downloadButton.type = "button";
        downloadButton.className = "generate-button";
        downloadButton.textContent = "Download Results as PDF";

        downloadButton.addEventListener("click", () => {
            downloadQuizPDF();
        });

        // Retry button.
        const retryButton = document.createElement("button");

        retryButton.type = "button";
        retryButton.className = "generate-button";
        retryButton.textContent = "Generate Another Quiz";

        retryButton.addEventListener("click", () => {
            clearInterval(quizTimerInterval);

            quizContainer.remove();

            document.getElementById("upload").scrollIntoView({
                behavior: "smooth"
            });

            showStatus(
                "Choose your settings and generate another quiz."
            );
        });

        result.append(
            resultTitle,
            scoreText,
            timeText,
            feedback,
            downloadButton,
            retryButton
        );

        result.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });
}

// ==========================================
// Download Quiz Results as PDF
// ==========================================

function downloadQuizPDF() {
    if (!quizSubmitted) {
        showStatus("Please complete the quiz before downloading your results.");
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert(
            "The PDF library could not be loaded. " +
            "Check your internet connection and refresh the page."
        );
        return;
    }

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 18;
    const contentWidth = pageWidth - margin * 2;

    let y = 20;

    // Add a page when there is insufficient space.
    function checkPageSpace(requiredHeight = 12) {
        if (y + requiredHeight > pageHeight - margin) {
            pdf.addPage();
            y = 20;
        }
    }

    // Write wrapped text.
    function addWrappedText(text, options = {}) {
        const {
            fontSize = 10,
            indent = 0,
            lineGap = 5,
            bold = false
        } = options;

        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(fontSize);

        const lines = pdf.splitTextToSize(
            String(text ?? ""),
            contentWidth - indent
        );

        checkPageSpace(lines.length * lineGap + 3);

        pdf.text(lines, margin + indent, y);

        y += lines.length * lineGap + 3;
    }

    // --------------------------------------
    // PDF Header
    // --------------------------------------

    pdf.setTextColor(40, 35, 75);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(23);

    pdf.text("QuizForge AI", margin, y);

    y += 9;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);

    pdf.text("Quiz Results Report", margin, y);

    y += 10;

    pdf.setDrawColor(140, 110, 255);
    pdf.setLineWidth(0.7);
    pdf.line(margin, y, pageWidth - margin, y);

    y += 10;

    // --------------------------------------
    // Score Summary
    // --------------------------------------

    const totalQuestions = userAnswers.length;

    const percentage = totalQuestions > 0
        ? Math.round((quizScore / totalQuestions) * 100)
        : 0;

    addWrappedText(
        `Final Score: ${quizScore} / ${totalQuestions} (${percentage}%)`,
        { fontSize: 13, bold: true, lineGap: 6 }
    );

    addWrappedText(
        `Time Taken: ${formatTime(quizTimeTaken)}`,
        { fontSize: 11 }
    );

    addWrappedText(
        `Date: ${new Date().toLocaleDateString()}`,
        { fontSize: 10 }
    );

    y += 4;

    pdf.setDrawColor(210, 210, 225);
    pdf.line(margin, y, pageWidth - margin, y);

    y += 9;

    // --------------------------------------
    // Questions and Answers
    // --------------------------------------

    userAnswers.forEach((answer, index) => {
        checkPageSpace(30);

        addWrappedText(
            `${index + 1}. ${answer.question}`,
            { fontSize: 11, bold: true, lineGap: 5.5 }
        );

        answer.options.forEach((option, optionIndex) => {
            const letter = String.fromCharCode(65 + optionIndex);

            addWrappedText(
                `${letter}. ${option}`,
                { fontSize: 9.5, indent: 4, lineGap: 4.5 }
            );
        });

        y += 2;

        addWrappedText(
            `Your Answer: ${answer.selectedAnswer}`,
            { fontSize: 9.5, indent: 4, lineGap: 4.5 }
        );

        addWrappedText(
            `Correct Answer: ${answer.correctAnswer}`,
            { fontSize: 9.5, indent: 4, lineGap: 4.5, bold: true }
        );

        addWrappedText(
            `Result: ${answer.isCorrect ? "Correct" : "Incorrect"}`,
            { fontSize: 9.5, indent: 4, lineGap: 4.5 }
        );

        if (answer.explanation) {
            addWrappedText(
                `Explanation: ${answer.explanation}`,
                { fontSize: 9, indent: 4, lineGap: 4.5 }
            );
        }

        y += 4;

        checkPageSpace(5);

        pdf.setDrawColor(225, 225, 235);
        pdf.line(margin, y, pageWidth - margin, y);

        y += 7;
    });

    // --------------------------------------
    // Footer and Page Numbers
    // --------------------------------------

    const pageCount = pdf.internal.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 140);

        pdf.text(
            "Generated by QuizForge AI",
            margin,
            pageHeight - 8
        );

        pdf.text(
            `Page ${page} of ${pageCount}`,
            pageWidth - margin,
            pageHeight - 8,
            { align: "right" }
        );
    }

    pdf.save("QuizForge-AI-Quiz-Results.pdf");
}
