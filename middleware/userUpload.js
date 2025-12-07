const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/audio/users"),
  filename: (req, file, cb) => {
    const { IDBaiThi, IDCauHoi } = req.body;
    let ext = path.extname(file.originalname);
    if (!ext) ext = ".webm";
    cb(null, `${IDBaiThi}_${IDCauHoi}${ext}`);
  },
});

const userUpload = multer({ storage });

module.exports = userUpload;