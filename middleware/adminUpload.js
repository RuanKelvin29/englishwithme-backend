const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    let uploadPath = "";

    if (file.fieldname === "TestImage") {
      uploadPath = "public/images/tests";
    } else if (file.fieldname.includes("Image")) {
      uploadPath = "public/images/passages";
    } else if (file.mimetype.startsWith("audio/")) {
      uploadPath = "uploads/audio/admin";
    } else {
      uploadPath = "uploads/others";
    }

    await fs.ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);

    let finalName = "";

    if (file.fieldname === "TestImage") {
      finalName = `test${timestamp}`;
    }
    else if (file.fieldname.includes("Image")) {
      finalName = `passage${timestamp}_${random}`;
    }
    else if (file.mimetype.startsWith("audio/")) {
      finalName = `audio${timestamp}_${random}`;
    }
    else {
      finalName = `file${timestamp}_${random}`;
    }
    cb(null, finalName + ext);
  },
});
const adminUpload = multer({ storage });

module.exports = adminUpload;