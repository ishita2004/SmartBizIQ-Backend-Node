// server.js
import 'dotenv/config'; // load .env
import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Middlewares --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// -------------------- Check API Key --------------------
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set! Add it to .env or Render environment variables.");
  process.exit(1);
}

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// -------------------- CSV Storage --------------------
let csvData = []; // memory storage for parsed CSV

// -------------------- Upload CSV --------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ detail: "No file uploaded" });
    }

    const csvFile = req.files.file;
    const uploadDir = path.join(__dirname, "uploads");
    const uploadPath = path.join(uploadDir, csvFile.name);

    // Ensure uploads directory exists
    fs.mkdirSync(uploadDir, { recursive: true });

    // Save file
    await csvFile.mv(uploadPath);

    // Parse CSV
    csvData = [];
    fs.createReadStream(uploadPath)
      .pipe(csv())
      .on("data", (row) => csvData.push(row))
      .on("end", () => {
        console.log(`✅ CSV parsed: ${csvData.length} rows`);
        res.json({
          message: "CSV uploaded and parsed successfully",
          rows: csvData.length,
          filename: csvFile.name,
        });
      });

  } catch (err) {
    console.error("❌ Error in /upload:", err);
    res.status(500).json({ detail: "File upload failed", error: err.message });
  }
});

// -------------------- Chat with CSV context --------------------
app.post("/chat", async (req, res) => {
  try {
    const { user_query } = req.body;
    if (!user_query) return res.status(400).json({ detail: "Query is required" });

    // Limit CSV preview
    const csvPreview = csvData.length > 0
      ? `CSV Data (first 50 rows):\n${JSON.stringify(csvData.slice(0, 50))}`
      : "No CSV uploaded yet.";

    const prompt = `
You are a business analytics assistant. Use the CSV data to answer user queries.
${csvPreview}

User question: ${user_query}
`;

    // ✅ Use ai instead of genAI
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);

    res.json({ answer: result.response.text() });

  } catch (err) {
    console.error("❌ Error in /chat:", err);
    res.status(500).json({ detail: "Failed to get AI response", error: err.message });
  }
});
