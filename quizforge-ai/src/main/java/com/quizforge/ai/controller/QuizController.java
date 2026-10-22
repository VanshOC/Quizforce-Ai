package com.quizforge.ai.controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quizforge.ai.service.GeminiService;
@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/quiz")
//@CrossOrigin(origins = "*")
public class QuizController {

    private final GeminiService geminiService;

    public QuizController(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    @PostMapping("/generate")
    public ResponseEntity<?> generateQuiz(
            @RequestBody Map<String, Object> request) {

        try {
            Object textObject = request.get("text");
            Object countObject = request.get("numberOfQuestions");

            if (!(textObject instanceof String pdfText)
                    || pdfText.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of(
                                "error",
                                "Please provide the extracted PDF text."));
            }

            int numberOfQuestions = 5;

            if (countObject != null) {
                numberOfQuestions =
                        Integer.parseInt(countObject.toString());
            }

            String result = geminiService.generateQuiz(
                    pdfText, numberOfQuestions);

            return ResponseEntity.ok(Map.of("result", result));

        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of(
                            "error",
                            "numberOfQuestions must be a number."));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));

        } catch (Exception e) {
            e.printStackTrace();

            return ResponseEntity.internalServerError()
                    .body(Map.of(
                            "error",
                            e.getClass().getSimpleName() + ": "
                                    + (e.getMessage() == null
                                            ? "Unknown error"
                                            : e.getMessage())));
        }
    }
}