const express = require("express");
const sql = require("mssql");
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const userUpload = require('../middleware/userUpload')

router.post("/upload-audio", authenticateToken, userUpload.single("audio"), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Không tìm thấy file audio" });

        const fileUrl = `/uploads/audio/users/${req.file.filename}`;
        res.json({ success: true, fileUrl });
    } catch (err) {
        console.error("Lỗi khi load file audio:", err);
        res.status(500).json({ error: "Có lỗi khi load file audio, vui lòng thử lại!" });
    }
});

module.exports = router;