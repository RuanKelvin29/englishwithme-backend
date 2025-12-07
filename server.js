require("dotenv").config();
const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["http://localhost:3000", "https://englishwithme-seven.vercel.app"],
  credentials: true
}));

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

app.use("/images", express.static(path.join(__dirname, "public/images")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


async function connectDB() {
  try {
    await sql.connect(config);
    console.log(" Kết nối thành công đến SQL Server!");
  } catch (err) {
    console.error(" Lỗi kết nối:", err.message);
    process.exit(1);
  }
}
connectDB();

app.get('/', (req, res) => {
  res.send('Server is alive');
});

const authRoutes = require("./routes/auth")
app.use("/api/auth", authRoutes)

const testsRoutes = require("./routes/tests")
app.use("/api/tests", testsRoutes)

const submissionsRoutes = require("./routes/submissions")
app.use("/api/submissions", submissionsRoutes)

const accountsRoutes = require("./routes/accounts")
app.use("/api/accounts", accountsRoutes)

const uploadsRoutes = require("./routes/uploads")
app.use("/api/uploads", uploadsRoutes)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Server chạy tại http://localhost:${PORT}`);
});