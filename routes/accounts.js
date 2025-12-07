const express = require("express");
const sql = require("mssql");
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

router.get("/", authenticateToken, authorizeRole(["admin"]), async (req, res) => {
  try {
    const { searchType, searchValue } = req.query;

    let query = "SELECT * FROM TaiKhoan";
    let params = [];

    if (searchType && searchValue) {
      if (searchType === "IDTaiKhoan") {
        query += " WHERE IDTaiKhoan LIKE @searchValue";
      } else if (searchType === "Email") {
        query += " WHERE Email LIKE @searchValue";
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
      accounts: result.recordset
    });
  } catch (err) {
    console.error("Lỗi truy vấn danh sách TaiKhoan:", err);
    res.status(500).json({ error: "Lỗi server", details: err.message });
  }
});

router.get("/:IDTaiKhoan", authenticateToken, authorizeRole(["admin"]), async (req, res) => {
  try {
    const { IDTaiKhoan } = req.params;
    const { searchType, searchValue } = req.query;

    const request = new sql.Request();
    
    request.input("IDTaiKhoan", sql.VarChar, IDTaiKhoan);

    const userResult = await request.query(`
        SELECT IDTaiKhoan, Email, VaiTro, NgayTao, ThoiGianDangNhap 
        FROM TaiKhoan 
        WHERE IDTaiKhoan = @IDTaiKhoan
    `);

    const userInfo = userResult.recordset[0] || null;

    if (!userInfo) {
        return res.status(404).json({ error: "Người dùng không tồn tại" });
    }

    let submissionQuery = `
      SELECT 
        bt.IDBaiThi,
        bt.ThoiGianBatDau,
        bt.ThoiGianKetThuc,
        bt.TongDiem,
        bt.IDDeThi,
        dt.TenDeThi,
        dt.SoCauHoi,
        dt.LoaiDeThi
      FROM BaiThi bt
      INNER JOIN DeThi dt ON bt.IDDeThi = dt.IDDeThi
      WHERE bt.IDTaiKhoan = @IDTaiKhoan
    `;

    if (searchType && searchValue) {
      if (searchType == "TenDeThi") {
        submissionQuery += " AND TenDeThi LIKE @searchValue";
      } else if (searchType == "LoaiDeThi") {
        submissionQuery += " AND LoaiDeThi LIKE @searchValue";
      }
      request.input("searchValue", sql.VarChar, `%${searchValue}%`);
    }

    const submissionResult = await request.query(submissionQuery);

    res.json({
      success: true,
      user: userInfo,
      submissions: submissionResult.recordset,
    });

  } catch (err) {
    console.error("Lỗi khi lấy danh sách bài thi và thông tin user:", err);
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại!" });
  }
});

router.delete("/:IDTaiKhoan", authenticateToken, authorizeRole(["admin"]), async (req, res) => {
  const { IDTaiKhoan } = req.params;
  
  const transaction = new sql.Transaction();

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);
    
    request.input("IDTaiKhoan", sql.VarChar, IDTaiKhoan);

    const checkUser = await request.query("SELECT IDTaiKhoan FROM TaiKhoan WHERE IDTaiKhoan = @IDTaiKhoan");
    
    if (checkUser.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: "Tài khoản không tồn tại!" });
    }

    await request.query(`
        DELETE FROM CauTraLoi 
        WHERE IDBaiThi IN (SELECT IDBaiThi FROM BaiThi WHERE IDTaiKhoan = @IDTaiKhoan)
    `);

    await request.query("DELETE FROM BaiThi WHERE IDTaiKhoan = @IDTaiKhoan");

    await request.query("DELETE FROM TaiKhoan WHERE IDTaiKhoan = @IDTaiKhoan");

    await transaction.commit();
    
    res.json({ success: true, message: "Xóa tài khoản và dữ liệu liên quan thành công!" });

  } catch (error) {
    if (transaction._aborted === false) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Lỗi khi rollback:", rollbackError);
      }
    }
    console.error("Xảy ra lỗi xóa tài khoản:", error);
    res.status(500).json({ error: "Có lỗi khi xóa tài khoản. Vui lòng thử lại sau!", details: error.message });
  }
});

module.exports = router;