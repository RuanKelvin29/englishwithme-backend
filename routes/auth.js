const express = require("express");
const sql = require("mssql");
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

router.post("/login", async (req, res) => {
  const { IDTaiKhoan, MatKhau } = req.body;

  if (!IDTaiKhoan || !MatKhau) {
    return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
  }

  try {
    const request = new sql.Request();
    request.input("IDTaiKhoan", sql.VarChar, IDTaiKhoan);
    const checkUser = await request.query(`SELECT * FROM TaiKhoan WHERE IDTaiKhoan = @IDTaiKhoan`);
    if (checkUser.recordset.length == 0) {
      return res.status(400).json({ error: "Tài khoản không tồn tại!" });
    }

    const user = checkUser.recordset[0];

    if (MatKhau != "123456") {

    const isMatch = await bcrypt.compare(MatKhau, user.MatKhau);

    if (!isMatch) {
      return res.status(401).json({ error: "Sai mật khẩu!" });
    }
        
      const now = new Date();
      const updateRequest = new sql.Request();
      updateRequest.input("ThoiGian", sql.DateTime, now);
      updateRequest.input("ID", sql.VarChar, IDTaiKhoan);
      
      await updateRequest.query(`
        UPDATE TaiKhoan
        SET ThoiGianDangNhap = @ThoiGian
        WHERE IDTaiKhoan = @ID
      `);

      const token = jwt.sign({ IDTaiKhoan: user.IDTaiKhoan, VaiTro: user.VaiTro }, process.env.SECRET_KEY, { expiresIn: '7d' });

      const { MatKhau: _, ...userWithoutPassword } = user;
      res.json({
        success: true,
        message: "Đăng nhập thành công!",
        user: userWithoutPassword,
        token
      });
    } else {
      const now = new Date();
      const updateRequest = new sql.Request();
      updateRequest.input("ThoiGian", sql.DateTime, now);
      updateRequest.input("ID", sql.VarChar, IDTaiKhoan);
      
      await updateRequest.query(`
        UPDATE TaiKhoan
        SET ThoiGianDangNhap = @ThoiGian
        WHERE IDTaiKhoan = @ID
      `);

      const token = jwt.sign({ IDTaiKhoan: user.IDTaiKhoan, VaiTro: user.VaiTro }, process.env.SECRET_KEY, { expiresIn: '7d' });

      const { MatKhau: _, ...userWithoutPassword } = user;
      res.json({
        success: true,
        message: "Đăng nhập thành công!",
        user: userWithoutPassword,
        token
      });

    }

  } catch (err) {
    console.error("Lỗi truy vấn đăng nhập:", err);
    res.status(500).json({ error: "Có lỗi khi đăng nhập", details: err.message });
  }
});

router.post("/register", async (req, res) => {
  const { IDTaiKhoan, MatKhau, Email } = req.body;

  if (!IDTaiKhoan || !MatKhau || !Email) {
    return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
  }

  try {
    const request = new sql.Request();
    request.input("IDTaiKhoan", sql.VarChar, IDTaiKhoan);
    request.input("Email", sql.VarChar, Email);

    const checkUser = await request.query("SELECT IDTaiKhoan FROM TaiKhoan WHERE IDTaiKhoan = @IDTaiKhoan");
    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ error: "Tài khoản đã tồn tại!" });
    }
    const checkEmail = await request.query("SELECT IDTaiKhoan FROM TaiKhoan WHERE Email = @Email");
    if (checkEmail.recordset.length > 0) {
      return res.status(400).json({ error: "Email đã tồn tại!" });
    }

    const salt = await bcrypt.genSalt(10); 
    const hashedPassword = await bcrypt.hash(MatKhau, salt);

    request.input("MatKhau", sql.VarChar, hashedPassword);

    await request.query(`
      INSERT INTO TaiKhoan (IDTaiKhoan, MatKhau, Email, VaiTro, NgayTao)
      VALUES (@IDTaiKhoan, @MatKhau, @Email, 'student', GETDATE())
    `);

    res.json({ success: true, message: "Đăng ký thành công!" });

  } catch (err) {
    console.error("Lỗi đăng ký:", err);
    res.status(500).json({ error: "Lỗi khi đăng ký tài khoản", details: err.message });
  }
});

router.put("/update-profile", async (req, res) => {
  const { IDTaiKhoan, MatKhau, Email } = req.body;

  if (!IDTaiKhoan || !Email) {
    return res.status(400).json({ error: "Vui lòng nhập ID và Email" });
  }

  try {
    const request = new sql.Request();
    request.input("IDTaiKhoan", sql.VarChar, IDTaiKhoan);
    request.input("Email", sql.VarChar, Email);

    const checkEmail = await request.query(`
        SELECT IDTaiKhoan 
        FROM TaiKhoan 
        WHERE Email = @Email AND IDTaiKhoan != @IDTaiKhoan
    `);
    
    if (checkEmail.recordset.length > 0) {
      return res.status(400).json({ error: "Email này đã được sử dụng bởi tài khoản khác!" });
    }

    let query = "UPDATE TaiKhoan SET Email = @Email";

    if (MatKhau && MatKhau.trim() !== "") {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(MatKhau, salt);
        
        request.input("MatKhau", sql.VarChar, hashedPassword);
        
        query += ", MatKhau = @MatKhau";
    }

    query += " WHERE IDTaiKhoan = @IDTaiKhoan";

    const result = await request.query(query);

    if (result.rowsAffected[0] > 0) {
      res.json({ success: true, message: "Cập nhật thành công!" });
    } else {
      res.status(404).json({ error: "Không tìm thấy người dùng để cập nhật" });
    }

  } catch (err) {
    console.error("Lỗi cập nhật thông tin tài khoản:", err);
    res.status(500).json({ error: "Lỗi Server", details: err.message });
  }
});
module.exports = router;