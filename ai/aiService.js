require("dotenv").config();
const fs = require('fs');
const mime = require('mime-types');

let genAI, model;
async function initGemini() {
  if (!genAI) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return model;
}

function extractScore(text) {
  const match = text.match(/Score:\s*([\d\.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

async function scoreWriting(questionText, content, passageText) {
  const model = await initGemini();

  if (!content || content.trim().length === 0) {
    return {
      score: 0,
      feedback: "Thí sinh chưa nhập câu trả lời."
    };
  }

  if (content.trim().length < 5) {
    return {
      score: 0,
      feedback: "Câu trả lời quá ngắn, không đủ cơ sở để chấm điểm."
    };
  }

  const passageSection = passageText 
    ? `ĐỀ BÀI:\n${passageText}\n\n` 
    : '';

  const prompt = `
    Bạn là giám khảo IELTS Writing.
    Đây là đề bài và bài làm của thí sinh.

    ${passageSection}

    CÂU HỎI:
    ${questionText}

    BÀI LÀM CỦA THÍ SINH:
    ${content}

    Hãy chấm bài bằng tiếng Anh, dùng text thuần, không markdown, không dùng ký hiệu, trả về đúng format:

    Score: <điểm từ 0-100>
    Feedback: <nhận xét chi tiết>
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return {
      score: extractScore(text),
      feedback: text
    };
  } catch (err) {
    console.error(err);
    return {
      score: 0,
      feedback: "Lỗi xử lý đoạn văn."
    }
  }
}

async function scoreSpeaking(questionText, filePath, passageText) {
  const model = await initGemini();

  const passageSection = passageText 
    ? `ĐỀ BÀI:\n${passageText}\n\n` 
    : '';

  if (!filePath) {
    return { score: 0, feedback: "Chưa có câu trả lời." };
  }

  if (!fs.existsSync(filePath)) {
    console.log("⚠️ File không tồn tại:", filePath);
    return { score: 0, feedback: "Chưa có câu trả lời (File không tồn tại)." };
  }

  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    console.log("⚠️ Đường dẫn là thư mục:", filePath);
    return { score: 0, feedback: "Chưa có câu trả lời." };
  }

  const audioBuffer = fs.readFileSync(filePath);

  if (audioBuffer.length === 0) {
    return { score: 0, feedback: "File ghi âm bị lỗi rỗng." };
  }

  const audioBase64 = audioBuffer.toString('base64');
  const mimeType = "audio/webm";

  const prompt = `
    Bạn là giám khảo IELTS Speaking.
    Hãy nghe file audio và đánh giá khả năng nói.

    ${passageSection}

    CÂU HỎI: ${questionText}

    Trả về nhận xét bằng tiếng Anh, dùng text thuần, không markdown, không dùng ký hiệu, đúng format:

    Score: <điểm từ 0-100>
    Feedback: <nhận xét chi tiết>
  `;

  const parts = [
    { text: prompt },
    {
      inlineData: { mimeType, data: audioBase64 }
    }
  ];

  try {
    const result = await model.generateContent(parts);
    const text = result.response.text();
    return {
      score: extractScore(text),
      feedback: text
    };
  } catch (err) {
    console.error(err);
    return { score: 0, feedback: "Lỗi xử lý audio." };
  }
}

module.exports = { scoreWriting, scoreSpeaking };