# AI LearnPath 4.0 — Web giáo viên và học sinh (Toán lớp 4)

**Repo này triển khai được thành một website có giao diện, API, lưu trữ và tích hợp Gemini bằng một Cloudflare Worker.** Không cần cài Python, CMD, EXE, không cần tạo D1/Supabase. Người dùng cuối mở đường link trên điện thoại hoặc máy tính.

> **Quan trọng:** Chỉ tải ZIP lên GitHub Pages là **không đủ**: GitHub Pages chỉ host tĩnh, không giữ được Gemini API key an toàn và không chạy được CSDL. Hãy làm đúng hướng dẫn Cloudflare Workers dưới đây. AI LearnPath chưa được triển khai vào tài khoản Cloudflare của bạn; bạn phải thực hiện thao tác kết nối tài khoản và thiết lập 2 Secret **một lần**. Giáo viên và học sinh **không** phải làm các bước này.

## CÁCH ĐƯA LÊN INTERNET — TỪ GITHUB (5 bước)

1. **Giải nén ZIP**, tạo một repository trên GitHub và tải **toàn bộ nội dung bên trong thư mục `AI_LearnPath_WEB_FINAL`** (các mục `public/`, `src/`, `tests/`, `wrangler.jsonc`, `package.json`, v.v.). Không tải nguyên ZIP thành một tệp trong repo. Đặt repository Private khi chưa hoàn tất cấu hình.
2. Vào **https://dash.cloudflare.com/** → **Workers & Pages** → **Create application** → **Import a repository** → kết nối GitHub → chọn repository vừa tạo.
3. Chọn **Worker name** `ai-learnpath-4-web` (phải khớp `name` trong `wrangler.jsonc`), root `/`, **Build command:** `npm run deploy`. Nếu giao diện Cloudflare yêu cầu lệnh cài: `npm install`. Chọn **Save and Deploy**. Sau lần này Cloudflare cung cấp địa chỉ dạng `https://ai-learnpath-4-web.<tên-tài-khoản>.workers.dev`.
4. Vào **Worker → Settings → Variables and Secrets → Add**. Tạo **hai Secret** (Type **Secret**, không phải Text):
   - `GEMINI_API_KEY`: khóa Gemini **MỚI** có quyền truy cập Gemini API. Không dùng khóa đã gửi trong chat, ảnh hoặc repo.
   - `ADMIN_SETUP_CODE`: một mã bí mật do bạn tự tạo dài ít nhất 16 ký tự (để chỉ bạn mở tài khoản giáo viên quản trị lần đầu).
   Bấm **Deploy** để áp dụng. `GEMINI_MODEL` đã được đặt là `gemini-2.5-flash` trong `wrangler.jsonc`. Có thể đổi tên mô hình trong file này nếu tài khoản không truy cập được.
5. Mở link `workers.dev`. Chọn **Giáo viên**, đăng ký **tài khoản quản trị đầu tiên** bằng email, mật khẩu tối thiểu 10 ký tự và `ADMIN_SETUP_CODE` vừa đặt. Tạo lớp, nhập học sinh, giao bài. Giáo viên khác đăng ký bằng **mã mời** (nút **Mời giáo viên** ở Tổng quan). Học sinh dùng **mã lớp + mã HS + PIN** được cấp.

**Từ bước này trở đi:** người dùng chỉ mở link website, không cần cài đặt hoặc nhập API key. Các lần push sau lên GitHub sẽ được Cloudflare tự động triển khai nếu liên kết Builds được bật.

### KHÔNG CẦN cài thêm Python hoặc tạo CSDL riêng

- Hosting: Cloudflare Workers + Static Assets.
- Dữ liệu: SQLite-backed Durable Object, tự tạo khi Worker được deploy bằng migration `v1` (bậc miễn phí có hạn mức).
- AI: Google Gemini REST API qua Worker, **không bao giờ để khóa trong HTML/JavaScript client**.
- Frontend: HTML, CSS, JavaScript nguyên bản; không có bước build frontend/phụ thuộc CDN để đọc Excel.

## Tính năng

### Không gian giáo viên
- Đăng nhập và phân quyền, tạo nhiều lớp.
- Nhập danh sách học sinh `.xlsx` hoặc `.csv` (các cột `Mã HS`, `Họ tên`, `PIN`). Nếu để trống PIN, hệ thống tạo mã 6 số và trả một lần cho giáo viên.
- Nhập bảng điểm `.xlsx/.csv` với `Mã HS`, `Điểm`, `Điểm tối đa`.
- Ngân hàng **42 câu Toán 4** tự biên soạn, **7 chủ đề**, 3 mức độ; chọn câu để giao bài theo lớp.
- Phân tích kết quả bài luyện theo câu và kỹ năng; xem báo cáo và xuất CSV; in/lưu PDF bằng tính năng in trình duyệt.
- Gemini phân tích hồ sơ ẩn danh, kết quả lớp, soạn phiếu luyện tập Toán 4; giáo viên có thể **Duyệt và lưu nhận xét**. Giới hạn 30 lượt AI/ngày/giáo viên.
- Tạo phiếu ngay từ ngân hàng câu hỏi, có phần đáp án riêng để giáo viên kiểm tra.

### Không gian học sinh
- Mã lớp + mã học sinh + PIN, dùng trên điện thoại và máy tính.
- Làm bài được giao, nhận điểm, đáp án và lời giải sau khi nộp.
- Bài ôn tập cá nhân hóa dựa theo những kỹ năng còn yếu; giáo viên kiểm duyệt ngân hàng câu hỏi.
- Gợi ý Gemini **không tiết lộ ngay đáp án** theo thiết kế prompt; giới hạn 5 lượt/ngày/HS.

## Kiểm tra và lưu ý

- Có 10 bài kiểm thử tự động (ngân hàng câu hỏi, chấm điểm, phân kỹ năng, đăng nhập, phân quyền, giao/nộp bài, nhập điểm, báo cáo, AI prompt). Chạy bằng Node 22: `npm test`.
- Phiên bản đã được kiểm thử bằng SQLite tương thích trong Node; **chưa được xác nhận qua một lần triển khai Cloudflare trên tài khoản thật**. Sau khi deploy, cần chạy thử từ đầu đến cuối và **kiểm tra Gemini bằng API key của bạn**.
- Không có sẵn tên miền hoạt động; tài khoản GitHub/Cloudflare và quyền đặt Secret phải do chủ sở hữu thực hiện.
- Không nên nhập thông tin định danh học sinh thật khi chưa có quyền xử lý dữ liệu phù hợp. **Không dùng bộ 34 hồ sơ giả định làm bằng chứng tác động giáo dục**.
- Đây là bản phát hành phục vụ trình diễn và thử nghiệm có kiểm soát; trước khi sử dụng đại trà với dữ liệu thật cần kiểm thử tải, bảo mật, phân quyền và quy trình sao lưu/khôi phục.
- Trình duyệt khuyến nghị: Chrome/Edge mới để đọc trực tiếp `.xlsx` (OOXML). Chỉ hỗ trợ **trang tính đầu tiên**; file `.xls` cũ cần chuyển sang `.xlsx`.
- Nếu khóa Gemini bị lộ, thu hồi ở Google AI Studio và tạo khóa mới, sau đó thay trong Cloudflare Secrets. **Không nhúng khóa trong repo**.

## Cấu trúc repo

```
public/             # Website: trang login, giáo viên, học sinh, Excel, CSS
src/worker.js       # API backend + SQLite Durable Object + Gemini gateway
src/logic.js        # Chấm điểm, phân kỹ năng, chọn bài thích ứng
src/questions.json  # Ngân hàng 42 câu tự biên soạn
wrangler.jsonc      # Cloudflare Worker + Durable Object + static assets
.github/workflows/  # Kiểm thử tự động khi push lên GitHub
tests/              # 10 bài kiểm thử
```

## Chạy cho nhà phát triển (không cần cho GV/HS)

Dành riêng cho người muốn phát triển mã nguồn: cài Node.js 22, rồi `npm install`, tạo `.dev.vars` theo mẫu `.dev.vars.example` (không commit), chạy `npm run dev`. Truy cập URL do Wrangler báo. Cách này **không phải quy trình sử dụng của giáo viên**.

## Khi gặp lỗi triển khai

| Thông báo | Hướng xử lý |
|---|---|
| Worker name mismatch | Trong Cloudflare chọn chính xác `ai-learnpath-4-web` hoặc đồng bộ thuộc tính `name` |
| `ADMIN_SETUP_CODE` chưa được đặt | Thêm Secret trong Settings, Deploy lại |
| AI chưa cấu hình | Thêm `GEMINI_API_KEY` qua Settings/Secrets rồi Deploy |
| Gemini HTTP 403 | Google đã từ chối quyền của dự án; không phải lỗi kết nối web |
| Gemini 429 | Hết hạn mức hoặc giới hạn tốc độ mô hình |
| Đăng nhập học sinh không được | Kiểm tra mã lớp, mã HS, PIN 6 chữ số, lớp đã có học sinh chưa |
| Không nhập được `.xlsx` | Dùng Chrome/Edge mới nhất; bảo đảm trang tính đầu có hàng tiêu đề |

Tài liệu chính thức: [Cloudflare Workers Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/), [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Gemini API](https://ai.google.dev/api/generate-content).
