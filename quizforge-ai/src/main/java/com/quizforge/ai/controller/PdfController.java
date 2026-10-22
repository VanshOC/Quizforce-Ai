package com.quizforge.ai.controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import java.io.IOException;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.quizforge.ai.service.PdfService;
@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/pdf")
public class PdfController {

    private final PdfService pdfService;

    public PdfController(PdfService pdfService) {
        this.pdfService = pdfService;
    }

    @PostMapping(
        value = "/extract",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Map<String, String>> extractPdf(
            @RequestParam("file") MultipartFile file) {

        try {
            String text = pdfService.extractText(file);

            return ResponseEntity.ok(
                Map.of("text", text)
            );

        } catch (IllegalArgumentException e) {

            return ResponseEntity.badRequest().body(
                Map.of("error", e.getMessage())
            );

        } catch (IOException e) {

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                Map.of("error", "Unable to read the PDF file.")
            );
        }
    }
}