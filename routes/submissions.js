const express = require("express");
const sql = require("mssql");
const router = express.Router();
const path = require("path");
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {scoreWriting, scoreSpeaking} = require('../ai/aiService');

router.get("/", authenticateToken, async (req, res) => {
  try {
    const { IDTaiKhoan } = req.user;
    const { searchType, searchValue } = req.query;

    let query = `SELECT 
        bt.*,
        dt.TenDeThi,
        dt.SoCauHoi,
        dt.LoaiDeThi
      FROM BaiThi bt
      INNER JOIN DeThi dt ON bt.IDDeThi = dt.IDDeThi
      WHERE bt.IDTaiKhoan = @IDTaiKhoan`;
    let params = [{name: "IDTaiKhoan", value: IDTaiKhoan}]

    if (searchType && searchValue) {
      if (searchType == "TenDeThi") {
        query += " AND TenDeThi LIKE @searchValue";
      } else if (searchType == "LoaiDeThi") {
        query += " AND LoaiDeThi LIKE @searchValue";
      }
      params.push({name: "searchValue", value: `%${searchValue}%`});
    }

    const request = new sql.Request();
    for (const p of params) {
      request.input(p.name, sql.VarChar, p.value);
    }

    query += " ORDER BY bt.TongDiem DESC";

    const result = await request.query(query); 
    
    res.json({
      success: true,
      submissions: result.recordset,
    });
  } catch (err) {
    console.error("Lỗi khi lấy danh sách bài thi:", err);
    res.status(500).json({ error: "Có lỗi khi lấy danh sách bài thi, vui lòng thử lại!" });
  }
});

router.get("/test/:IDDeThi", authenticateToken, authorizeRole(["admin"]), async (req, res) => {
  try {
    const { IDDeThi } = req.params;
    const { searchType, searchValue } = req.query;

    let query = `
      SELECT 
        bt.*, 
        dt.TenDeThi, dt.LoaiDeThi, dt.SoCauHoi,
        tk.Email as NguoiLam
      FROM BaiThi bt
      INNER JOIN DeThi dt ON bt.IDDeThi = dt.IDDeThi
      INNER JOIN TaiKhoan tk ON bt.IDTaiKhoan = tk.IDTaiKhoan
      WHERE bt.IDDeThi = @IDDeThi
    `;
    let params = [{name: "IDDeThi", value: IDDeThi}]

    if (searchType && searchValue) {
      if (searchType === "IDTaiKhoan") {
        query += " AND bt.IDTaiKhoan LIKE @searchValue";
      } else if (searchType === "Email") {
        query += " AND Email LIKE @searchValue";
      }
      params.push({ name: "searchValue", value: `%${searchValue}%` });
    }
    
    const request = new sql.Request();
    for (const p of params) {
      request.input(p.name, sql.VarChar, p.value);
    }

    query += " ORDER BY bt.TongDiem DESC"

    const result = await request.query(query);

    res.json({
      success: true,
      submissions: result.recordset
    });
  } catch (err) {
    console.error("Lỗi lấy danh sách bài làm của đề thi:", err);
    res.status(500).json({ error: "Lỗi khi lấy danh sách bài thi" });
  }
});

router.get("/:IDBaiThi", authenticateToken, async (req, res) => {
  const { IDBaiThi } = req.params;
  const { IDTaiKhoan, VaiTro } = req.user;

  try {
    const baiThiResult = await sql.query`
      SELECT bt.*, dt.TenDeThi, dt.LoaiDeThi
      FROM BaiThi bt
      INNER JOIN DeThi dt on bt.IDDeThi = dt.IDDeThi
      WHERE bt.IDBaiThi = ${IDBaiThi}
    `;

    if (!baiThiResult.recordset || baiThiResult.recordset.length === 0) {
      return res.status(404).json({ error: "Bài thi không tồn tại!" });
    }

    const baiThi = baiThiResult.recordset[0];

    if (baiThi.IDTaiKhoan !== IDTaiKhoan && VaiTro !== "admin") {
      return res
        .status(403)
        .json({ error: "Bạn không có quyền truy cập vào bài thi này!" });
    }

    const part1Promise = sql.query`
    SELECT 
      c.IDCauHoi, c.NoiDung AS CauHoiNoiDung, c.LoaiCauHoi, c.Diem, c.Audio,
      d.IDDapAn, d.NoiDung AS DapAnNoiDung, d.KetQua,
      ctl.IDCauTraLoi, ctl.IDDapAn AS IDDapAnCauTraLoi, ctl.NoiDung AS CauTraLoiNoiDung, 
      ctl.DiemAI, ctl.NhanXetAI
    FROM BaiThi bt
    INNER JOIN CauTraLoi ctl ON bt.IDBaiThi = ctl.IDBaiThi
    INNER JOIN CauHoi c ON ctl.IDCauHoi = c.IDCauHoi
    LEFT JOIN DapAn d ON c.IDCauHoi = d.IDCauHoi
    WHERE bt.IDBaiThi = ${IDBaiThi}
      AND c.IDDoanVan IS NULL
    ORDER BY c.IDCauHoi
    `;

    const part2Promise = sql.query`
    SELECT 
      dv.IDDoanVan, dv.NoiDung AS DoanVanNoiDung, dv.Audio AS DoanVanAudio, dv.EncodeAnh,
      c.IDCauHoi, c.NoiDung AS CauHoiNoiDung, c.LoaiCauHoi, c.Diem, c.Audio AS CauHoiAudio,
      d.IDDapAn, d.NoiDung AS DapAnNoiDung, d.KetQua,
      ctl.IDCauTraLoi, ctl.IDDapAn AS IDDapAnCauTraLoi, ctl.NoiDung AS CauTraLoiNoiDung, ctl.DiemAI, ctl.NhanXetAI
    FROM BaiThi bt
    INNER JOIN CauTraLoi ctl ON bt.IDBaiThi = ctl.IDBaiThi
    INNER JOIN CauHoi c ON ctl.IDCauHoi = c.IDCauHoi
    LEFT JOIN DapAn d ON c.IDCauHoi = d.IDCauHoi
    LEFT JOIN DoanVan dv ON c.IDDoanVan = dv.IDDoanVan
    WHERE bt.IDBaiThi = ${IDBaiThi}
      AND c.IDDoanVan IS NOT NULL
    ORDER BY dv.IDDoanVan, c.IDCauHoi
    `;

    const [part1Result, part2Result] = await Promise.all([part1Promise, part2Promise]);

    const part1Rows = part1Result.recordset || [];

    const part1Map = {};
    part1Rows.forEach((row) => {
      if (!part1Map[row.IDCauHoi]) {
        part1Map[row.IDCauHoi] = {
          IDCauHoi: row.IDCauHoi,
          NoiDung: row.CauHoiNoiDung,
          LoaiCauHoi: row.LoaiCauHoi,
          Audio: row.Audio,
          Diem: row.Diem,
          CauTraLoi: {
            IDCauTraLoi: row.IDCauTraLoi,
            IDDapAn: row.IDDapAnCauTraLoi,
            NoiDung: row.CauTraLoiNoiDung,
            DiemAI: row.DiemAI,
            NhanXetAI: row.NhanXetAI,
          },
          DapAn: [],
        };
      }
      if (row.IDDapAn) {
        part1Map[row.IDCauHoi].DapAn.push({
          IDDapAn: row.IDDapAn,
          NoiDung: row.DapAnNoiDung,
          KetQua: row.KetQua,
        });
      }
    });
    const part1 = Object.values(part1Map);

    const part2Rows = part2Result.recordset || [];

    const part2Map = {};
    part2Rows.forEach((row) => {
      if (!part2Map[row.IDDoanVan]) {
        part2Map[row.IDDoanVan] = {
          IDDoanVan: row.IDDoanVan,
          NoiDung: row.DoanVanNoiDung,
          Audio: row.DoanVanAudio,
          EncodeAnh: row.EncodeAnh,
          CauHoi: [],
        };
      }

      let cauHoiObj = part2Map[row.IDDoanVan].CauHoi.find(
        (q) => q.IDCauHoi === row.IDCauHoi
      );

      if (!cauHoiObj) {
        cauHoiObj = {
          IDCauHoi: row.IDCauHoi,
          LoaiCauHoi: row.LoaiCauHoi,
          NoiDung: row.CauHoiNoiDung,
          Audio: row.CauHoiAudio,
          Diem: row.Diem,
          CauTraLoi: {
            IDCauTraLoi: row.IDCauTraLoi,
            IDDapAn: row.IDDapAnCauTraLoi,
            NoiDung: row.CauTraLoiNoiDung,
            DiemAI: row.DiemAI,
            NhanXetAI: row.NhanXetAI,
          },
          DapAn: [],
        };
        part2Map[row.IDDoanVan].CauHoi.push(cauHoiObj);
      }

      if (row.IDDapAn) {
        cauHoiObj.DapAn.push({
          IDDapAn: row.IDDapAn,
          NoiDung: row.DapAnNoiDung,
          KetQua: row.KetQua,
        });
      }
    });

    const part2 = Object.values(part2Map);

    res.json({
      success: true,
      message: "Lấy chi tiết bài thi thành công",
      submission: {
        ...baiThi,
        Part1: part1,
        Part2: part2,
      }
    });
  } catch (err) {
    console.error("Lỗi khi lấy chi tiết bài thi:", err);
    res
      .status(500)
      .json({ error: "Có lỗi khi hiển thị chi tiết bài thi, vui lòng thử lại!" });
  }
});

router.post("/start-submission", authenticateToken, async (req, res) => {
  const { IDDeThi, user } = req.body;
  const { IDTaiKhoan } = user;
  const now = new Date();

  const pad = (n) => String(n).padStart(2, "0");
  const ThoiGianTao = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const IDBaiThi = `${IDDeThi}_${IDTaiKhoan}_${ThoiGianTao}`;

  try {
    await sql.query`
      INSERT INTO BaiThi (IDBaiThi, ThoiGianBatDau, IDTaiKhoan, IDDeThi, TongDiem)
      VALUES (${IDBaiThi}, ${now.toISOString()}, ${IDTaiKhoan}, ${IDDeThi}, 0)
    `;

    res.json({ success: true, IDBaiThi, ThoiGianBatDau: now });
  } catch (err) {
    console.error("Lỗi khi tạo bài thi:", err);
    res.status(500).json({ error: "Có lỗi khi tạo bài thi, vui lòng thử lại!" });
  }
});

router.post("/submit-submission", authenticateToken, async (req, res) => {
  const { IDBaiThi, answers } = req.body;
  const now = new Date();

  try {
    const listQuestionID = Object.keys(answers);
    if (listQuestionID.length === 0) {
        return res.status(400).json({ error: "Không có câu trả lời nào được gửi lên." });
    }

    const readReq = new sql.Request();
    
    const safeListID = listQuestionID.map(id => id.replace(/'/g, "''")).join("','");
    const queryQuestions = `SELECT 
        ch.IDCauHoi, 
        ch.LoaiCauHoi, 
        ch.NoiDung AS NoiDungCauHoi, 
        dv.NoiDung AS NoiDungDoanVan
      FROM CauHoi ch
      LEFT JOIN DoanVan dv ON ch.IDDoanVan = dv.IDDoanVan 
      WHERE ch.IDCauHoi IN ('${safeListID}')`; 
    
    const questions = await readReq.query(queryQuestions);

    const questionMap = {};
    questions.recordset.forEach(q => {
        questionMap[q.IDCauHoi] = { 
            Loai: q.LoaiCauHoi, 
            NoiDung: q.NoiDungCauHoi,
            Passage: q.NoiDungDoanVan 
        };
    });

    const processedAnswers = await Promise.all(
      Object.entries(answers).map(async ([IDCauHoi, answerValue]) => {
        const qData = questionMap[IDCauHoi];
        if (!qData) return null;

        const IDCauTraLoi = `${IDBaiThi}_${IDCauHoi}`;
        let aiScore = null;
        let aiFeedback = null;

        if (qData.Loai === "WRITING") {
          const result = await scoreWriting(qData.NoiDung, answerValue, qData.Passage);
          aiScore = result.score;
          aiFeedback = result.feedback;
        } else if (qData.Loai === "SPEAKING") {
          const cleanUrl = answerValue.split('?')[0];
          const relativePath = cleanUrl.startsWith("/") ? cleanUrl.slice(1) : cleanUrl;
          const absolutePath = path.join(process.cwd(), relativePath);
          const result = await scoreSpeaking(qData.NoiDung, absolutePath, qData.Passage);
          aiScore = result.score;
          aiFeedback = result.feedback;
        }

        return {
          IDCauTraLoi,
          IDCauHoi,
          IDBaiThi,
          answerValue,
          LoaiCauHoi: qData.Loai,
          aiScore,
          aiFeedback
        };
      })
    );
    
    const transaction = new sql.Transaction();
    await transaction.begin();

    try {
      const reqUpdateEnd = new sql.Request(transaction);
      reqUpdateEnd.input("IDBaiThi", sql.VarChar, IDBaiThi);
      reqUpdateEnd.input("ThoiGianKetThuc", sql.VarChar, now.toISOString());
      
      await reqUpdateEnd.query(`UPDATE BaiThi SET ThoiGianKetThuc = @ThoiGianKetThuc WHERE IDBaiThi = @IDBaiThi`);

      for (const item of processedAnswers) {
        if (!item) continue;

        const reqInsert = new sql.Request(transaction);
        reqInsert.input("IDCauTraLoi", sql.VarChar, item.IDCauTraLoi);
        reqInsert.input("IDBaiThi", sql.VarChar, item.IDBaiThi);
        reqInsert.input("IDCauHoi", sql.VarChar, item.IDCauHoi);

        if (item.LoaiCauHoi === "READING" || item.LoaiCauHoi === "LISTENING") {
           reqInsert.input("IDDapAn", sql.VarChar, item.answerValue);
           await reqInsert.query(`
             INSERT INTO CauTraLoi (IDCauTraLoi, IDBaiThi, IDCauHoi, IDDapAn)
             VALUES (@IDCauTraLoi, @IDBaiThi, @IDCauHoi, @IDDapAn)
           `);
        } else {
           reqInsert.input("NoiDung", sql.VarChar, item.answerValue);
           reqInsert.input("DiemAI", sql.Int, item.aiScore || 0); 
           reqInsert.input("NhanXetAI", sql.VarChar, item.aiFeedback || "");
           
           await reqInsert.query(`
             INSERT INTO CauTraLoi (IDCauTraLoi, IDBaiThi, IDCauHoi, NoiDung, DiemAI, NhanXetAI)
             VALUES (@IDCauTraLoi, @IDBaiThi, @IDCauHoi, @NoiDung, @DiemAI, @NhanXetAI)
           `);
        }
      }

      const reqCalc = new sql.Request(transaction);
      reqCalc.input("IDBaiThiCalc", sql.VarChar, IDBaiThi);
      
      const resultScore = await reqCalc.query(`
        SELECT 
          ISNULL(SUM(c.Diem), 0) + ISNULL(SUM(ctl.DiemAI), 0) AS TongDiem
        FROM CauTraLoi ctl
        LEFT JOIN DapAn da ON ctl.IDDapAn = da.IDDapAn AND da.KetQua = 1
        LEFT JOIN CauHoi c ON da.IDCauHoi = c.IDCauHoi
        WHERE ctl.IDBaiThi = @IDBaiThiCalc
      `);

      const TongDiem = resultScore.recordset[0].TongDiem || 0;

      const reqUpdateScore = new sql.Request(transaction);
      reqUpdateScore.input("FinalScore", sql.Int, TongDiem);
      reqUpdateScore.input("IDBaiThiFinal", sql.VarChar, IDBaiThi);
      
      await reqUpdateScore.query(`UPDATE BaiThi SET TongDiem = @FinalScore WHERE IDBaiThi = @IDBaiThiFinal`);

      await transaction.commit();

      res.json({ success: true, message: "Nộp bài thành công! Me sẽ tự động chuyển trang sau khi hoàn tất chấm điểm!" });

    } catch (innerError) {
      if (transaction._aborted === false) await transaction.rollback();
      throw innerError;
    }

  } catch (err) {
    console.error("Lỗi khi nộp bài:", err);
    res.status(500).json({ error: "Có lỗi khi nộp bài, vui lòng thử lại!", details: err.message });
  }
});

router.delete("/:IDBaiThi", authenticateToken, async (req, res) => {
  const { IDBaiThi } = req.params;
  const { IDTaiKhoan, VaiTro } = req.user; 

  const transaction = new sql.Transaction();

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);
    request.input("IDBaiThi", sql.VarChar, IDBaiThi);

    const baiThiResult = await request.query("SELECT IDBaiThi, IDTaiKhoan FROM BaiThi WHERE IDBaiThi = @IDBaiThi");

    if (!baiThiResult.recordset || baiThiResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: "Bài thi không tồn tại!" });
    }

    const baiThi = baiThiResult.recordset[0];

    if (baiThi.IDTaiKhoan !== IDTaiKhoan && VaiTro !== "admin") {
      await transaction.rollback();
      return res
        .status(403)
        .json({ error: "Bạn không có quyền xóa bài thi này!" });
    }

    await request.query("DELETE FROM CauTraLoi WHERE IDBaiThi = @IDBaiThi");
    
    await request.query("DELETE FROM BaiThi WHERE IDBaiThi = @IDBaiThi");

    await transaction.commit();
    
    res.json({ success: true, message: "Xóa bài thi thành công!" });

  } catch (error) {
    if (transaction._aborted === false) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error("Lỗi khi rollback:", rollbackError);
        }
    }

    console.error("Xảy ra lỗi xóa bài thi:", error);
    res.status(500).json({ error: "Có lỗi khi xóa bài thi. Vui lòng thử lại sau!", details: error.message });
  }
});

module.exports = router;