const express = require("express");
const sql = require("mssql");
const router = express.Router();
const jwt = require('jsonwebtoken');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const adminUpload = require('../middleware/adminUpload');

router.get("/", async (req, res) => {
  try {
    const { searchType, searchValue, viewMode } = req.query;
    const authHeader = req.headers['authorization'];

    let isAdmin = false;
    if (viewMode === 'admin' && authHeader) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        if (decoded.VaiTro === 'admin') isAdmin = true;
      } catch (e) { }
    }

    let query = "SELECT * FROM DeThi WHERE 1=1";
    let params = [];

    if (!isAdmin) {
      query += " AND IsHidden = 0";
    }

    if (searchType && searchValue) {
      if (searchType === "TenDeThi") {
        query += " AND TenDeThi LIKE @searchValue";
      } else if (searchType === "LoaiDeThi") {
        query += " AND LoaiDeThi LIKE @searchValue";
      }
      params.push({ name: "searchValue", value: `%${searchValue}%` });
    }

    const request = new sql.Request();
    for (const p of params) {
      request.input(p.name, sql.VarChar, p.value);
    }

    const result = await request.query(query);
    res.json({
      success: true,
      tests: result.recordset
    });

  } catch (err) {
    console.error("Lỗi truy vấn bảng DeThi:", err);
    res.status(500).json({ error: "Lỗi server", details: err.message });
  }
});

router.get("/edit/:IDDeThi", authenticateToken, authorizeRole(["admin"]), async (req, res) => {
  try {
    const { IDDeThi } = req.params;

    const deThiPromise = sql.query`SELECT * FROM DeThi WHERE IDDeThi = ${IDDeThi}`;

    const part1Promise = sql.query`
      SELECT c.IDCauHoi, c.NoiDung AS CauHoiNoiDung, c.LoaiCauHoi, c.Diem, c.Audio, 
      d.IDDapAn, d.NoiDung AS DapAnNoiDung, d.KetQua
      FROM CauHoi c
      LEFT JOIN DapAn d ON c.IDCauHoi = d.IDCauHoi
      WHERE c.IDDeThi = ${IDDeThi} AND c.IDDoanVan IS NULL
    `;

    const part2Promise = sql.query`
      SELECT dv.IDDoanVan, dv.NoiDung AS DoanVanNoiDung, dv.Audio AS DoanVanAudio, dv.EncodeAnh,
             c.IDCauHoi, c.LoaiCauHoi, c.NoiDung AS CauHoiNoiDung, c.Diem, c.Audio AS CauHoiAudio,
             d.IDDapAn, d.NoiDung AS DapAnNoiDung, d.KetQua
      FROM DoanVan dv
      LEFT JOIN CauHoi c ON c.IDDoanVan = dv.IDDoanVan
      LEFT JOIN DapAn d ON c.IDCauHoi = d.IDCauHoi
      WHERE dv.IDDeThi = ${IDDeThi}
      ORDER BY dv.IDDoanVan, c.IDCauHoi
    `;

    const [deThiResult, part1Result, part2Result] = await Promise.all([
      deThiPromise,
      part1Promise,
      part2Promise
    ]);

    if (!deThiResult.recordset || deThiResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy đề thi",
      });
    }

    const deThi = deThiResult.recordset[0];

    const part1Rows = part1Result.recordset || [];

    const part1Map = {};
    part1Rows.forEach((row) => {
      if (!part1Map[row.IDCauHoi]) {
        part1Map[row.IDCauHoi] = {
          IDCauHoi: row.IDCauHoi,
          NoiDung: row.CauHoiNoiDung,
          LoaiCauHoi: row.LoaiCauHoi,
          Diem: row.Diem,
          Audio: row.Audio,
          DapAn: []
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

      if (row.IDCauHoi) {
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
      }
    });

    const part2 = Object.values(part2Map);

    res.json({
      success: true,
      test: {
        ...deThi,
        Part1: part1,
        Part2: part2,
      },
    });
  } catch (err) {
    console.error(`Lỗi truy vấn chi tiết DeThi ID=${req.params.IDDeThi}:`, err);
    res.status(500).json({
      success: false,
      error: "Lỗi khi lấy chi tiết đề thi",
      details: err.message,
    });
  }
});

router.get("/:IDDeThi", authenticateToken, async (req, res) => {
  try {
    const { IDDeThi } = req.params;

    const deThiPromise = sql.query`SELECT * FROM DeThi WHERE IDDeThi = ${IDDeThi}`;

    const part1Promise = sql.query`
      SELECT c.IDCauHoi, c.NoiDung AS CauHoiNoiDung, c.LoaiCauHoi, c.Diem, c.Audio, 
      d.IDDapAn, d.NoiDung AS DapAnNoiDung
      FROM CauHoi c
      LEFT JOIN DapAn d ON c.IDCauHoi = d.IDCauHoi
      WHERE c.IDDeThi = ${IDDeThi} AND c.IDDoanVan IS NULL
    `;

    const part2Promise = sql.query`
      SELECT dv.IDDoanVan, dv.NoiDung AS DoanVanNoiDung, dv.Audio AS DoanVanAudio, dv.EncodeAnh,
             c.IDCauHoi, c.LoaiCauHoi, c.NoiDung AS CauHoiNoiDung, c.Diem, c.Audio AS CauHoiAudio,
             d.IDDapAn, d.NoiDung AS DapAnNoiDung
      FROM DoanVan dv
      LEFT JOIN CauHoi c ON c.IDDoanVan = dv.IDDoanVan
      LEFT JOIN DapAn d ON c.IDCauHoi = d.IDCauHoi
      WHERE dv.IDDeThi = ${IDDeThi}
      ORDER BY dv.IDDoanVan, c.IDCauHoi
    `;

    const [deThiResult, part1Result, part2Result] = await Promise.all([
      deThiPromise,
      part1Promise,
      part2Promise
    ]);

    if (!deThiResult.recordset || deThiResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy đề thi",
      });
    }

    const deThi = deThiResult.recordset[0];

    const part1Rows = part1Result.recordset || [];

    const part1Map = {};
    part1Rows.forEach((row) => {
      if (!part1Map[row.IDCauHoi]) {
        part1Map[row.IDCauHoi] = {
          IDCauHoi: row.IDCauHoi,
          NoiDung: row.CauHoiNoiDung,
          LoaiCauHoi: row.LoaiCauHoi,
          Diem: row.Diem,
          Audio: row.Audio,
          DapAn: []
        };
      }
      if (row.IDDapAn) {
        part1Map[row.IDCauHoi].DapAn.push({
          IDDapAn: row.IDDapAn,
          NoiDung: row.DapAnNoiDung,
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

      if (row.IDCauHoi) {
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
            DapAn: [],
          };
          part2Map[row.IDDoanVan].CauHoi.push(cauHoiObj);
        }

        if (row.IDDapAn) {
          cauHoiObj.DapAn.push({
            IDDapAn: row.IDDapAn,
            NoiDung: row.DapAnNoiDung,
          });
        }
      }
    });

    const part2 = Object.values(part2Map);

    res.json({
      success: true,
      test: {
        ...deThi,
        Part1: part1,
        Part2: part2,
      },
    });
  } catch (err) {
    console.error(`Lỗi truy vấn chi tiết DeThi ID=${req.params.IDDeThi}:`, err);
    res.status(500).json({
      success: false,
      error: "Lỗi truy vấn chi tiết đề thi",
      details: err.message,
    });
  }
});

router.post("/create-test", authenticateToken, authorizeRole(["admin"]), adminUpload.any(), async (req, res) => {
  const transaction = new sql.Transaction();

  try {
    const { TenDeThi, LoaiDeThi, SoCauHoi, MieuTa, IsHidden, ThoiGianLam } = req.body;
    const parsedData = JSON.parse(req.body.data);
    const files = req.files || [];

    const getFileName = (fieldName) => {
      const file = files.find((f) => f.fieldname === fieldName);
      if (!file) return null;
      if (file.fieldname === "TestImage") {
        return `/tests/${file.filename}`;
      }
      if (file.fieldname.includes("Image")) {
        return `/passages/${file.filename}`;
      }
      return `/uploads/audio/admin/${file.filename}`;
    };

    for (const dv of parsedData.DoanVan) {
      if (!dv.NoiDung?.trim()) {
        return res.status(400).json({ error: "Đoạn văn không được để trống" });
      }

      for (const ch of dv.CauHoi) {
        if (!ch.NoiDung?.trim()) {
          return res.status(400).json({ error: "Nội dung câu hỏi không được để trống" });
        }

        if (ch.DapAn && ch.DapAn.length > 0) {
          for (const da of ch.DapAn) {
            if (!da.NoiDung.trim()) {
              return res.status(400).json({ error: "Nội dung đáp án không được để trống" });
            }
          }
          const hasCorrect = ch.DapAn.some(da => da.KetQua == "true" || da.KetQua == 1);
          if (!hasCorrect) {
            return res.status(400).json({ error: `Câu hỏi "${ch.NoiDung}" chưa chọn đáp án đúng!` });
          }
        }
      }
    }

    for (const ch of parsedData.CauHoiRieng) {
      if (!ch.NoiDung?.trim()) {
        return res.status(400).json({ error: "Nội dung câu hỏi không được để trống" });
      }
      if (ch.DapAn && ch.DapAn.length > 0) {
        for (const da of ch.DapAn) {
          if (!da.NoiDung.trim()) {
            return res.status(400).json({ error: "Nội dung đáp án không được để trống" });
          }
        }
        const hasCorrect = ch.DapAn.some(da => da.KetQua == "true" || da.KetQua == 1);
        if (!hasCorrect) {
          return res.status(400).json({ error: `Câu hỏi "${ch.NoiDung}" chưa chọn đáp án đúng!` });
        }
      }
    }

    await transaction.begin();

    const timestamp = Date.now();
    const idDeThi = `T${timestamp}`;

    const testImage = getFileName("TestImage");

    const reqDeThi = new sql.Request(transaction);
    await reqDeThi
      .input("IDDeThi", sql.VarChar, idDeThi)
      .input("TenDeThi", sql.VarChar, TenDeThi)
      .input("LoaiDeThi", sql.VarChar, LoaiDeThi)
      .input("EncodeAnh", sql.VarChar, testImage)
      .input("MieuTa", sql.VarChar, MieuTa || "")
      .input("IsHidden", sql.Bit, Number(IsHidden) || 0)
      .input("SoCauHoi", sql.Int, Number(SoCauHoi))
      .input("ThoiGianLam", sql.Int, Number(ThoiGianLam))
      .query(`
              INSERT INTO DeThi (IDDeThi, TenDeThi, LoaiDeThi, EncodeAnh, MieuTa, SoCauHoi, ThoiGianLam, NgayTao, IsHidden)
              VALUES (@IDDeThi, @TenDeThi, @LoaiDeThi, @EncodeAnh, @MieuTa, @SoCauHoi, @ThoiGianLam, GETDATE(), @IsHidden)
          `);


    let globalQuestionIndex = 1;

    for (let i = 0; i < parsedData.CauHoiRieng.length; i++) {
      const ch = parsedData.CauHoiRieng[i];

      const idCauHoi = `${idDeThi}_Q${globalQuestionIndex++}`;
      const audioPath = getFileName(`CauHoiRieng[${i}].Audio`);

      const reqCH = new sql.Request(transaction);
      await reqCH
        .input("IDCauHoi", sql.VarChar, idCauHoi)
        .input("LoaiCauHoi", sql.VarChar, ch.LoaiCauHoi)
        .input("NoiDung", sql.VarChar, ch.NoiDung)
        .input("Audio", sql.VarChar, audioPath)
        .input("Diem", sql.Int, ch.Diem)
        .input("IDDeThi", sql.VarChar, idDeThi)
        .query(`
                  INSERT INTO CauHoi (IDCauHoi, LoaiCauHoi, NoiDung, Audio, Diem, IDDeThi, IDDoanVan)
                  VALUES (@IDCauHoi, @LoaiCauHoi, @NoiDung, @Audio, @Diem, @IDDeThi, NULL)
              `);

      if (ch.DapAn && ch.DapAn.length > 0) {
        for (let k = 0; k < ch.DapAn.length; k++) {
          const da = ch.DapAn[k];
          const idDapAn = `${idCauHoi}_A${k + 1}`;

          const reqDA = new sql.Request(transaction);
          await reqDA
            .input("IDDapAn", sql.VarChar, idDapAn)
            .input("NoiDung", sql.VarChar, da.NoiDung)
            .input("KetQua", sql.Bit, da.KetQua)
            .input("IDCauHoi", sql.VarChar, idCauHoi)
            .query(`
                          INSERT INTO DapAn (IDDapAn, NoiDung, KetQua, IDCauHoi)
                          VALUES (@IDDapAn, @NoiDung, @KetQua, @IDCauHoi)
                      `);
        }
      }
    }

    for (let i = 0; i < parsedData.DoanVan.length; i++) {
      const dv = parsedData.DoanVan[i];

      const idDoanVan = `${idDeThi}_P${Date.now() + i}`;

      const dvImage = getFileName(`DoanVan[${i}].Image`);
      const dvAudio = getFileName(`DoanVan[${i}].Audio`);

      const reqDV = new sql.Request(transaction);
      await reqDV
        .input("IDDoanVan", sql.VarChar, idDoanVan)
        .input("NoiDung", sql.VarChar, dv.NoiDung)
        .input("Audio", sql.VarChar, dvAudio)
        .input("EncodeAnh", sql.VarChar, dvImage)
        .input("IDDeThi", sql.VarChar, idDeThi)
        .query(`
                  INSERT INTO DoanVan (IDDoanVan, NoiDung, Audio, EncodeAnh, IDDeThi)
                  VALUES (@IDDoanVan, @NoiDung, @Audio, @EncodeAnh, @IDDeThi)
              `);

      for (let j = 0; j < dv.CauHoi.length; j++) {
        const chDv = dv.CauHoi[j];

        const idCauHoiDv = `${idDeThi}_Q${globalQuestionIndex++}`;
        const chDvAudio = getFileName(`DoanVan[${i}].CauHoi[${j}].Audio`);

        const reqCHDV = new sql.Request(transaction);
        await reqCHDV
          .input("IDCauHoi", sql.VarChar, idCauHoiDv)
          .input("LoaiCauHoi", sql.VarChar, chDv.LoaiCauHoi)
          .input("NoiDung", sql.VarChar, chDv.NoiDung)
          .input("Audio", sql.VarChar, chDvAudio)
          .input("Diem", sql.Int, chDv.Diem)
          .input("IDDoanVan", sql.VarChar, idDoanVan)
          .input("IDDeThi", sql.VarChar, idDeThi)
          .query(`
                      INSERT INTO CauHoi (IDCauHoi, LoaiCauHoi, NoiDung, Audio, Diem, IDDoanVan, IDDeThi)
                      VALUES (@IDCauHoi, @LoaiCauHoi, @NoiDung, @Audio, @Diem, @IDDoanVan, @IDDeThi)
                  `);

        if (chDv.DapAn && chDv.DapAn.length > 0) {
          for (let k = 0; k < chDv.DapAn.length; k++) {
            const da = chDv.DapAn[k];
            const idDapAnDv = `${idCauHoiDv}_A${k + 1}`;

            const reqDADV = new sql.Request(transaction);
            await reqDADV
              .input("IDDapAn", sql.VarChar, idDapAnDv)
              .input("NoiDung", sql.VarChar, da.NoiDung)
              .input("KetQua", sql.Bit, da.KetQua)
              .input("IDCauHoi", sql.VarChar, idCauHoiDv)
              .query(`
                              INSERT INTO DapAn (IDDapAn, NoiDung, KetQua, IDCauHoi)
                              VALUES (@IDDapAn, @NoiDung, @KetQua, @IDCauHoi)
                          `);
          }
        }
      }
    }

    await transaction.commit();
    res.status(200).json({ message: "Tạo đề thi thành công!", id: idDeThi });

  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Lỗi tạo đề thi:", error);
    res.status(500).json({ error: "Lỗi khi tạo đề thi", details: error.message });
  }
});


router.put("/update-test/:IDDeThi", authenticateToken, authorizeRole(["admin"]), adminUpload.any(), async (req, res) => {
  const transaction = new sql.Transaction();

  try {
    const { IDDeThi } = req.params;
    const { TenDeThi, LoaiDeThi, SoCauHoi, MieuTa, ThoiGianLam, IsHidden } = req.body;
    const parsedData = JSON.parse(req.body.data);
    const files = req.files || [];

    if (!IDDeThi) return res.status(400).json({ error: "Thiếu ID đề thi!" });

    const getFileOrOldPath = (fieldName, oldPathValue, type) => {
      const file = files.find((f) => f.fieldname === fieldName);
      if (file) {
        if (file.fieldname === "TestImage") return `/tests/${file.filename}`;
        if (file.fieldname.includes("Image")) return `/passages/${file.filename}`;
        return `/uploads/audio/admin/${file.filename}`;
      }
      return oldPathValue || null;
    };

    for (const dv of parsedData.DoanVan) {
      if (!dv.NoiDung?.trim()) {
        return res.status(400).json({ error: "Đoạn văn không được để trống" });
      }

      for (const ch of dv.CauHoi) {
        if (!ch.NoiDung?.trim()) {
          return res.status(400).json({ error: "Nội dung câu hỏi không được để trống" });
        }

        if (ch.DapAn && ch.DapAn.length > 0) {
          for (const da of ch.DapAn) {
            if (!da.NoiDung.trim()) {
              return res.status(400).json({ error: "Nội dung đáp án không được để trống" });
            }
          }
          const hasCorrect = ch.DapAn.some(da => da.KetQua == "true" || da.KetQua == 1);
          if (!hasCorrect) {
            return res.status(400).json({ error: `Câu hỏi "${ch.NoiDung}" chưa chọn đáp án đúng!` });
          }
        }
      }
    }

    for (const ch of parsedData.CauHoiRieng) {
      if (!ch.NoiDung?.trim()) {
        return res.status(400).json({ error: "Nội dung câu hỏi không được để trống" });
      }
      if (ch.DapAn && ch.DapAn.length > 0) {
        for (const da of ch.DapAn) {
          if (!da.NoiDung.trim()) {
            return res.status(400).json({ error: "Nội dung đáp án không được để trống" });
          }
        }
        const hasCorrect = ch.DapAn.some(da => da.KetQua == "true" || da.KetQua == 1);
        if (!hasCorrect) {
          return res.status(400).json({ error: `Câu hỏi "${ch.NoiDung}" chưa chọn đáp án đúng!` });
        }
      }
    }

    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("IDDeThi", sql.VarChar, IDDeThi);

    const maxQRes = await request.query(`
          SELECT MAX(CAST(SUBSTRING(IDCauHoi, LEN(@IDDeThi) + 3, LEN(IDCauHoi)) AS INT)) as MaxIndex
          FROM CauHoi 
          WHERE IDDeThi = @IDDeThi AND IDCauHoi LIKE @IDDeThi + '_Q%'
      `);

    let globalQuestionIndex = (maxQRes.recordset[0].MaxIndex || 0) + 1;

    const maxPRes = await request.query(`
          SELECT MAX(CAST(SUBSTRING(IDDoanVan, LEN(@IDDeThi) + 3, LEN(IDDoanVan)) AS INT)) as MaxIndex
          FROM DoanVan 
          WHERE IDDeThi = @IDDeThi AND IDDoanVan LIKE @IDDeThi + '_P%'
      `);
    let globalPassageIndex = (maxPRes.recordset[0].MaxIndex || 0) + 1;


    const newTestImage = files.find(f => f.fieldname === "TestImage");
    const reqTest = new sql.Request(transaction);
    reqTest.input("ID", sql.VarChar, IDDeThi);
    reqTest.input("Ten", sql.NVarChar, TenDeThi);
    reqTest.input("Loai", sql.VarChar, LoaiDeThi);
    reqTest.input("Mieu", sql.NVarChar, MieuTa);
    reqTest.input("SoCau", sql.Int, Number(SoCauHoi));
    reqTest.input("Time", sql.Int, Number(ThoiGianLam));
    reqTest.input("Hidden", sql.Bit, Number(IsHidden) || 0);

    let qUpdateTest = `
          UPDATE DeThi 
          SET TenDeThi=@Ten, LoaiDeThi=@Loai, MieuTa=@Mieu, 
              SoCauHoi=@SoCau, ThoiGianLam=@Time, IsHidden=@Hidden
      `;
    if (newTestImage) {
      reqTest.input("Anh", sql.VarChar, `/tests/${newTestImage.filename}`);
      qUpdateTest += `, EncodeAnh=@Anh`;
    }
    qUpdateTest += ` WHERE IDDeThi=@ID`;

    await reqTest.query(qUpdateTest);

    const processQuestions = async (listQuestions, IDDoanVan, audioPrefixFunc) => {

      //ID DB
      let whereSql = IDDoanVan ? `IDDoanVan = '${IDDoanVan}'` : `IDDeThi = '${IDDeThi}' AND IDDoanVan IS NULL`;
      const currentQRes = await new sql.Request(transaction).query(`SELECT IDCauHoi FROM CauHoi WHERE ${whereSql}`);
      const dbQuestionIDs = currentQRes.recordset.map(r => r.IDCauHoi);

      //ID FORM
      const incomingQuestionIDs = listQuestions
        .filter(q => q.IDCauHoi)
        .map(q => q.IDCauHoi);

      const qToDelete = dbQuestionIDs.filter(id => !incomingQuestionIDs.includes(id));
      for (const delId of qToDelete) {
        await new sql.Request(transaction).query(`DELETE FROM CauTraLoi WHERE IDCauHoi = '${delId}'`);
        await new sql.Request(transaction).query(`DELETE FROM DapAn WHERE IDCauHoi = '${delId}'`);
        await new sql.Request(transaction).query(`DELETE FROM CauHoi WHERE IDCauHoi = '${delId}'`);
      }

      for (let i = 0; i < listQuestions.length; i++) {
        const ch = listQuestions[i];
        const audioPath = getFileOrOldPath(audioPrefixFunc(i), ch.Audio);

        const reqCH = new sql.Request(transaction);
        reqCH.input("Loai", sql.VarChar, ch.LoaiCauHoi);
        reqCH.input("Noi", sql.NVarChar, ch.NoiDung);
        reqCH.input("Aud", sql.VarChar, audioPath);
        reqCH.input("Diem", sql.Int, ch.Diem);
        reqCH.input("DeThi", sql.VarChar, IDDeThi);
        if (IDDoanVan) reqCH.input("DoanVan", sql.VarChar, IDDoanVan);

        let currentQID = ch.IDCauHoi;

        if (ch.IDCauHoi && dbQuestionIDs.includes(ch.IDCauHoi)) {
          reqCH.input("ID", sql.VarChar, currentQID);
          await reqCH.query(`
                      UPDATE CauHoi 
                      SET LoaiCauHoi=@Loai, NoiDung=@Noi, Audio=@Aud, Diem=@Diem 
                      WHERE IDCauHoi=@ID
                  `);
        } else {
          currentQID = `${IDDeThi}_Q${globalQuestionIndex++}`;
          reqCH.input("ID", sql.VarChar, currentQID);

          const insertSQL = IDDoanVan
            ? `INSERT INTO CauHoi (IDCauHoi, LoaiCauHoi, NoiDung, Audio, Diem, IDDeThi, IDDoanVan) VALUES (@ID, @Loai, @Noi, @Aud, @Diem, @DeThi, @DoanVan)`
            : `INSERT INTO CauHoi (IDCauHoi, LoaiCauHoi, NoiDung, Audio, Diem, IDDeThi, IDDoanVan) VALUES (@ID, @Loai, @Noi, @Aud, @Diem, @DeThi, NULL)`;

          await reqCH.query(insertSQL);
        }

        if (ch.DapAn && ch.DapAn.length > 0) {
          //ID DB
          const currentAnsRes = await new sql.Request(transaction).query(`SELECT IDDapAn FROM DapAn WHERE IDCauHoi = '${currentQID}'`);
          const dbAnswerIDs = currentAnsRes.recordset.map(r => r.IDDapAn);

          //ID FORM
          const incomingAnswerIDs = ch.DapAn
            .filter(a => a.IDDapAn)
            .map(a => a.IDDapAn);

          const ansToDelete = dbAnswerIDs.filter(id => !incomingAnswerIDs.includes(id));
          if (ansToDelete.length > 0) {
            const strIds = ansToDelete.map(id => `'${id}'`).join(",");
            await new sql.Request(transaction).query(`DELETE FROM DapAn WHERE IDDapAn IN (${strIds})`);
          }

          //New ID
          let nextAnsIndex = 1;
          if (dbAnswerIDs.length > 0) {
            const indices = dbAnswerIDs.map(id => parseInt(id.split('_A').pop()) || 0);
            nextAnsIndex = Math.max(...indices) + 1;
          }

          for (let k = 0; k < ch.DapAn.length; k++) {
            const da = ch.DapAn[k];
            const reqDA = new sql.Request(transaction);
            reqDA.input("Noi", sql.NVarChar, da.NoiDung);
            reqDA.input("Ket", sql.Bit, da.KetQua);
            reqDA.input("QID", sql.VarChar, currentQID);

            if (da.IDDapAn && dbAnswerIDs.includes(da.IDDapAn)) {
              reqDA.input("ID", sql.VarChar, da.IDDapAn);
              await reqDA.query(`UPDATE DapAn SET NoiDung=@Noi, KetQua=@Ket WHERE IDDapAn=@ID`);
            } else {
              const idDapAn = `${currentQID}_A${nextAnsIndex++}`;

              reqDA.input("ID", sql.VarChar, idDapAn);
              await reqDA.query(`INSERT INTO DapAn (IDDapAn, NoiDung, KetQua, IDCauHoi) VALUES (@ID, @Noi, @Ket, @QID)`);
            }
          }
        }
      }
    };

    await processQuestions(parsedData.CauHoiRieng, null, (idx) => `CauHoiRieng[${idx}].Audio`);

    //ID DB
    const currentDvRes = await new sql.Request(transaction).query(`SELECT IDDoanVan FROM DoanVan WHERE IDDeThi = '${IDDeThi}'`);
    const dbPassageIDs = currentDvRes.recordset.map(r => r.IDDoanVan);

    //ID FORM
    const incomingPassageIDs = parsedData.DoanVan.filter(d => d.IDDoanVan).map(d => d.IDDoanVan);

    const pToDelete = dbPassageIDs.filter(id => !incomingPassageIDs.includes(id));
    for (const delId of pToDelete) {
      await new sql.Request(transaction).query(`DELETE FROM CauTraLoi WHERE IDCauHoi IN (SELECT IDCauHoi FROM CauHoi WHERE IDDoanVan = '${delId}')`);
      await new sql.Request(transaction).query(`DELETE FROM DapAn WHERE IDCauHoi IN (SELECT IDCauHoi FROM CauHoi WHERE IDDoanVan = '${delId}')`);
      await new sql.Request(transaction).query(`DELETE FROM CauHoi WHERE IDDoanVan = '${delId}'`);
      await new sql.Request(transaction).query(`DELETE FROM DoanVan WHERE IDDoanVan = '${delId}'`);
    }

    for (let i = 0; i < parsedData.DoanVan.length; i++) {
      const dv = parsedData.DoanVan[i];
      const dvImage = getFileOrOldPath(`DoanVan[${i}].Image`, dv.EncodeAnh);
      const dvAudio = getFileOrOldPath(`DoanVan[${i}].Audio`, dv.Audio);

      const reqDV = new sql.Request(transaction);
      reqDV.input("Noi", sql.NVarChar, dv.NoiDung);
      reqDV.input("Aud", sql.VarChar, dvAudio);
      reqDV.input("Img", sql.VarChar, dvImage);
      reqDV.input("De", sql.VarChar, IDDeThi);

      let currentDvID = dv.IDDoanVan;

      if (dv.IDDoanVan && dbPassageIDs.includes(dv.IDDoanVan)) {
        reqDV.input("ID", sql.VarChar, currentDvID);
        await reqDV.query(`UPDATE DoanVan SET NoiDung=@Noi, Audio=@Aud, EncodeAnh=@Img WHERE IDDoanVan=@ID`);
      } else {
        currentDvID = `${IDDeThi}_P${globalPassageIndex++}`;
        reqDV.input("ID", sql.VarChar, currentDvID);
        await reqDV.query(`INSERT INTO DoanVan (IDDoanVan, NoiDung, Audio, EncodeAnh, IDDeThi) VALUES (@ID, @Noi, @Aud, @Img, @De)`);
      }

      await processQuestions(dv.CauHoi, currentDvID, (qIdx) => `DoanVan[${i}].CauHoi[${qIdx}].Audio`);
    }

    await transaction.commit();
    res.json({ success: true, message: "Cập nhật đề thi thành công!" });

  } catch (error) {
    if (transaction._aborted === false) await transaction.rollback();
    console.error("Lỗi cập nhật:", error);
    res.status(500).json({ error: "Lỗi cập nhật", details: error.message });
  }
});

router.patch("/toggle-hidden/:IDDeThi", authenticateToken, authorizeRole(["admin"]), async (req, res) => {
  const { IDDeThi } = req.params;
  try {
    const request = new sql.Request();
    request.input("IDDeThi", sql.VarChar, IDDeThi);

    await request.query(`
          UPDATE DeThi 
          SET IsHidden = CASE WHEN IsHidden = 1 THEN 0 ELSE 1 END 
          WHERE IDDeThi = @IDDeThi
      `);

    res.json({ success: true, message: "Đã thay đổi trạng thái hiển thị!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi thay đổi trạng thái đề thi" });
  }
});

module.exports = router;