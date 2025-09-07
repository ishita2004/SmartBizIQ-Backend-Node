// server.js
import 'dotenv/config'; // load .env
import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";

const app = express();
const PORT = 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// -------------------- Check API Key --------------------
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set! Add it to .env or environment variables.");
  process.exit(1);
}

// -------------------- Initialize Gemini AI --------------------
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// -------------------- CSV Storage --------------------
let csvData = []; // store uploaded CSV in memory

// -------------------- Upload CSV --------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ detail: "No file uploaded" });
    }

    const csvFile = req.files.file;
    const uploadPath = path.join(__dirname, "uploads", csvFile.name);
    fs.mkdirSync(path.join(__dirname, "uploads"), { recursive: true });
    await csvFile.mv(uploadPath);

    // Parse CSV
    csvData = [];
    fs.createReadStream(uploadPath)
      .pipe(csv())
      .on("data", (row) => csvData.push(row))
      .on("end", () => {
        console.log(`CSV parsed: ${csvData.length} rows`);
        res.json({ message: "CSV uploaded and parsed successfully", rows: csvData.length });
      });

  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: "File upload failed" });
  }
});

// -------------------- Chat with CSV context --------------------
app.post("/chat", async (req, res) => {
  try {
    const { user_query } = req.body;
    if (!user_query) return res.status(400).json({ detail: "Query is required" });

    // Limit CSV preview to first 50 rows
    const csvPreview = csvData.length > 0
      ? `CSV Data (first 50 rows):\n${JSON.stringify(csvData.slice(0, 50))}`
      : "No CSV uploaded yet.";

    const prompt = `
You are a business assistant AI. Use the CSV data to answer the user's question.
${csvPreview}
User question: ${user_query}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    res.json({ answer: response?.text || "No response from AI." });

  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).json({ detail: "Failed to get AI response", error: err.message });
  }
});

// -------------------- Start server --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
