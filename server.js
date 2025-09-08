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
const allowedOrigins = [
  "https://smart-biz-iq-frontend1.vercel.app"
];

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin like mobile apps or curl
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = `❌ The CORS policy for this site does not allow access from the specified Origin.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
}));

// -------------------- Check API Key --------------------
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set! Add it to .env or Render environment variables.");
  process.exit(1);
}

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// -------------------- CSV Storage --------------------
let csvData = []; // memory storage for parsed CSV

// -------------------- Root health route --------------------
app.get("/", (req, res) => {
  res.send("✅ SmartBizIQ backend is running!");
});

// -------------------- Upload CSV --------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ detail: "No file uploaded" });
    }

    const csvFile = req.files.file;

    // Only allow CSV files
    if (!csvFile.name.endsWith(".csv")) {
      return res.status(400).json({ detail: "Only CSV files are allowed." });
    }

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

    // Format CSV preview for AI
    const csvPreview = csvData.length > 0
      ? csvData.slice(0, 10).map(row =>
          Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(", ")
        ).join("\n")
      : "No CSV uploaded yet.";

    const prompt = `
You are a business analytics assistant. Use the CSV data below to answer user queries.

CSV Preview (first 10 rows):
${csvPreview}

User question: ${user_query}
`;

    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);

    res.json({ answer: result.response.text() });

  } catch (err) {
    console.error("❌ Error in /chat:", err);
    res.status(500).json({ detail: "Failed to get AI response", error: err.message });
  }
});

// -------------------- Start Server --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
