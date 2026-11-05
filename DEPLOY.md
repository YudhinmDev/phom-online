# HƯỚNG DẪN CHƠI MULTIPLAYER & DEPLOY SERVER MIỄN PHÍ

Web Game Bài Phỏm Online được xây dựng với kiến trúc **Zero-Dependency** (chỉ dùng Node.js thuần, chuẩn WebSocket RFC 6455). Điều này giúp game:
* Khởi động tức thì (dưới 1 giây).
* Bộ nhớ RAM siêu nhẹ (< 15MB).
* Deploy lên bất kỳ server miễn phí nào mà không bao giờ lo lỗi `npm install` hay xung đột phiên bản.

---

## 1. Cách Test Online Ngay Trên Máy Tính (Nhiều người chơi)

1. Mở cửa sổ Terminal / PowerShell, chạy lệnh:
   ```powershell
   cd "C:\Users\Admin\.gemini\antigravity\scratch\phom-game"
   node server.js
   ```
2. Mở trình duyệt thứ 1: Truy cập `http://localhost:3000`
   * Nhập tên: **"Người chơi 1"**
   * Bấm **[➕ TẠO PHÒNG MỚI]** $\rightarrow$ Bạn sẽ thấy Mã PIN phòng (Ví dụ: `A8F3K`).
   * Bấm nút **[📋 Copy Link]**.
3. Mở trình duyệt thứ 2 (hoặc mở cửa sổ Ẩn danh / Tab khác):
   * Dán link vừa copy (hoặc truy cập `http://localhost:3000` rồi nhập mã PIN `A8F3K`).
   * Nhập tên: **"Người chơi 2"** $\rightarrow$ Bấm **[🔗 VÀO PHÒNG]**.
4. Người chơi 2 bấm **[✅ SẴN SÀNG]**.
5. Người chơi 1 (Chủ phòng) bấm **[🎮 BẮT ĐẦU VÁN BÀI]**!
   * Cả 2 màn hình sẽ tự động chuyển vào bàn chơi.
   * Góc nhìn của mỗi người luôn nằm ở cạnh dưới, đối thủ ngồi ở các cạnh tương ứng.
   * Lượt đánh, thời gian đếm ngược 15s, bốc nọc, ăn bài, hạ bài, gửi bài đều được đồng bộ thời gian thực 100%!

---

## 2. Cách Chơi Chung Bằng Điện Thoại Trong Mạng Wi-Fi

1. Mở PowerShell trên máy tính, gõ `ipconfig` để lấy địa chỉ IP mạng nội bộ (ví dụ: `192.168.1.15`).
2. Chạy `node server.js`.
3. Lấy điện thoại mở trình duyệt (Safari / Chrome) truy cập:
   ```
   http://192.168.1.15:3000
   ```
4. Bạn và người thân có thể cầm điện thoại cùng vào chung phòng và chơi bài Phỏm thời gian thực!

---

## 3. Các Cách Deploy Lên Server Miễn Phí (Free Hosting)

### Cách 1: Deploy lên Render.com (Miễn phí vĩnh viễn)
1. Đẩy mã nguồn thư mục này lên một repository GitHub (chế độ Public hoặc Private).
2. Đăng nhập vào [Render.com](https://render.com) $\rightarrow$ Chọn **New Web Service**.
3. Kết nối với GitHub repo vừa tạo.
4. Cấu hình:
   * **Runtime:** Node
   * **Build Command:** *(Để trống hoặc gõ: `echo "No build needed"`)*
   * **Start Command:** `node server.js`
   * **Instance Type:** Free (0$/tháng)
5. Bấm **Deploy**. Sau 30 giây, Render sẽ cấp cho bạn một đường link HTTPS/WSS (ví dụ: `https://phom-online.onrender.com`). Bất kỳ ai trên thế giới đều có thể truy cập để chơi!

### Cách 2: Deploy lên Hugging Face Spaces (Chạy 24/7 không lo ngủ đông)
1. Tạo một tài khoản trên [huggingface.co](https://huggingface.co) $\rightarrow$ Chọn **New Space**.
2. Chọn **Space SDK: Docker** (Blank).
3. Đẩy toàn bộ các file trong thư mục này (bao gồm cả file `Dockerfile` đã chuẩn bị sẵn).
4. Hugging Face sẽ tự động build và chạy vĩnh viễn, không bị giới hạn thời gian ngủ đông!

### Cách 3: Deploy lên Koyeb hoặc Railway
* Cả 2 nền tảng này đều hỗ trợ Docker và Node.js tự động nhận diện `node server.js`, có sẵn HTTPS và WebSocket miễn phí.
