package com.quizforge.ai.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.stereotype.Service;

@Service
public class GeminiService {

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    public String generateQuiz(String pdfText, int numberOfQuestions)
            throws Exception {

        // Step 1: Validate the extracted PDF text.
        if (pdfText == null || pdfText.isBlank()) {
            throw new IllegalArgumentException(
                    "The PDF does not contain readable text.");
        }

        // Step 2: Validate the requested question count.
        if (numberOfQuestions < 1 || numberOfQuestions > 20) {
            throw new IllegalArgumentException(
                    "Choose between 1 and 20 questions.");
        }

        // Step 3: Read the OpenRouter API key from the environment.
        String apiKey = System.getenv("OPENROUTER_API_KEY");

        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "OpenRouter API key is not configured. "
                    + "Add OPENROUTER_API_KEY in Eclipse Run Configurations.");
        }

        // Step 4: Limit the PDF text sent to the AI.
        String limitedText = pdfText.length() > 20000
                ? pdfText.substring(0, 20000)
                : pdfText;

        // Step 5: Create the quiz-generation prompt.
        String prompt = """
                Create %d multiple-choice quiz questions based ONLY on
                the following PDF text.

                Return valid JSON only, without Markdown code fences,
                using this exact structure:

                {
                  "questions": [
                    {
                      "question": "Question text",
                      "options": [
                        "Option A",
                        "Option B",
                        "Option C",
                        "Option D"
                      ],
                      "correctAnswer": "Option A",
                      "explanation": "Brief explanation"
                    }
                  ]
                }

                Rules:
                - Generate exactly %d questions.
                - Each question must have exactly four options.
                - There must be one correct answer per question.
                - The correctAnswer must exactly match one of the options.
                - Do not invent facts absent from the supplied text.
                - Return a valid JSON object, not a JSON string.
                - Do not include Markdown code fences or extra commentary.

                PDF TEXT:
                %s
                """.formatted(
                        numberOfQuestions,
                        numberOfQuestions,
                        limitedText);

        // Step 6: Build the OpenRouter request body.
        String requestBody = """
                {
"model": "deepseek/deepseek-v4.1-flash",                  "messages": [
                    {
                      "role": "system",
                      "content": "You are an educational quiz generator. Follow the user's instructions carefully and return valid JSON only."
                    },
                    {
                      "role": "user",
                      "content": %s
                    }
                  ],
                  "temperature": 0.3,
                  "max_tokens": 8000
                }
                """.formatted(toJsonString(prompt));

        // Step 7: Set the OpenRouter API endpoint.
        String endpoint =
                "https://openrouter.ai/api/v1/chat/completions";

        // Step 8: Create the HTTP request.
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .timeout(Duration.ofSeconds(90))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        // Step 9: Send the request and receive the response.
        HttpResponse<String> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString());

        // Step 10: Handle API errors.
        if (response.statusCode() < 200
                || response.statusCode() >= 300) {

            throw new IllegalStateException(
                    "OpenRouter API returned HTTP "
                    + response.statusCode()
                    + ": "
                    + response.body());
        }

        // Step 11: Extract the AI-generated quiz JSON.
        String quizJson = extractContent(response.body());

        if (quizJson == null || quizJson.isBlank()) {
            throw new IllegalStateException(
                    "OpenRouter returned an empty quiz. "
                    + "Please try again.");
        }

        // Remove accidental Markdown code fences if the model adds them.
        quizJson = quizJson.trim();

        if (quizJson.startsWith("```")) {
            quizJson = quizJson.replaceFirst(
                    "^```(?:json)?\\s*", "");
            quizJson = quizJson.replaceFirst(
                    "\\s*```$", "");
            quizJson = quizJson.trim();
        }

        // Return the quiz JSON to QuizController.
        return quizJson;
    }

    /**
     * Extracts choices[0].message.content from the OpenRouter response.
     * This method handles escaped quotes, backslashes and newlines.
     */
    private String extractContent(String responseBody) {

        String marker = "\"content\"";
        int markerIndex = responseBody.indexOf(marker);

        if (markerIndex == -1) {
            throw new IllegalStateException(
                    "Could not find quiz content in the OpenRouter response: "
                    + responseBody);
        }

        // Find the colon after "content".
        int index = responseBody.indexOf(':', markerIndex + marker.length());

        if (index == -1) {
            throw new IllegalStateException(
                    "Invalid OpenRouter response: content field is missing.");
        }

        index++;

        // Skip whitespace.
        while (index < responseBody.length()
                && Character.isWhitespace(responseBody.charAt(index))) {
            index++;
        }

        if (index >= responseBody.length()
                || responseBody.charAt(index) != '"') {
            throw new IllegalStateException(
                    "OpenRouter returned content in an unexpected format.");
        }

        // Skip the opening quotation mark.
        index++;

        StringBuilder result = new StringBuilder();

        while (index < responseBody.length()) {

            char c = responseBody.charAt(index++);

            // An unescaped quote marks the end of the content string.
            if (c == '"') {
                return result.toString();
            }

            if (c == '\\') {

                if (index >= responseBody.length()) {
                    throw new IllegalStateException(
                            "Invalid escaped content in OpenRouter response.");
                }

                char escaped = responseBody.charAt(index++);

                switch (escaped) {
                    case '"' -> result.append('"');
                    case '\\' -> result.append('\\');
                    case '/' -> result.append('/');
                    case 'b' -> result.append('\b');
                    case 'f' -> result.append('\f');
                    case 'n' -> result.append('\n');
                    case 'r' -> result.append('\r');
                    case 't' -> result.append('\t');

                    case 'u' -> {
                        if (index + 4 > responseBody.length()) {
                            throw new IllegalStateException(
                                    "Invalid Unicode escape in OpenRouter response.");
                        }

                        String hex = responseBody.substring(index, index + 4);

                        try {
                            result.append((char) Integer.parseInt(hex, 16));
                        } catch (NumberFormatException e) {
                            throw new IllegalStateException(
                                    "Invalid Unicode escape in OpenRouter response.",
                                    e);
                        }

                        index += 4;
                    }

                    default -> throw new IllegalStateException(
                            "Invalid escape sequence in OpenRouter response.");
                }

            } else {
                result.append(c);
            }
        }

        throw new IllegalStateException(
                "OpenRouter response ended before the quiz content was complete.");
    }

    /**
     * Escapes a Java string so it can safely be included in JSON.
     */
    private String toJsonString(String value) {

        StringBuilder result = new StringBuilder("\"");

        for (char c : value.toCharArray()) {

            switch (c) {
                case '"' -> result.append("\\\"");
                case '\\' -> result.append("\\\\");
                case '\n' -> result.append("\\n");
                case '\r' -> result.append("\\r");
                case '\t' -> result.append("\\t");
                case '\b' -> result.append("\\b");
                case '\f' -> result.append("\\f");

                default -> {
                    if (c < 0x20) {
                        result.append(
                                String.format("\\u%04x", (int) c));
                    } else {
                        result.append(c);
                    }
                }
            }
        }

        result.append("\"");

        return result.toString();
    }
}