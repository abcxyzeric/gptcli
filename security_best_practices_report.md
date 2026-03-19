# Báo cáo bảo mật Web UI ClipProxy

## Tóm tắt điều hành

Frontend React/TypeScript của web panel này nhìn chung không có dấu hiệu rõ ràng của DOM XSS kiểu `dangerouslySetInnerHTML`, `eval`, `document.write` hay nhúng secret thẳng vào bundle. Tuy vậy, hiện tại app **chưa đạt mức “bảo mật tốt” cho một admin panel** vì còn một rủi ro lớn: **management key được persist trong `localStorage` bằng cơ chế XOR có thể đảo ngược ngay trên client**, và lớp bảo vệ phía trình duyệt/edge (`CSP`, chống clickjacking) hiện còn thiếu.

Trong phạm vi repo này, mình ghi nhận:

- 1 finding mức `High`
- 2 findings mức `Medium`
- không thấy lỗ hổng DOM XSS trực tiếp trong code React hiện tại
- `npm audit --omit=dev` sạch cho dependency runtime production

## Phạm vi

- Đã review source frontend trong repo này.
- Đã kiểm tra runtime header của bản đang chạy tại `https://gptcli.pages.dev/`.
- Không có source backend Go trong repo; `cli-proxy-api.exe` được xem là ngoài phạm vi code review chi tiết.

## High

### F-001: Management key được lưu bền vững trong `localStorage` bằng “mã hóa” có thể đảo ngược ngay trên client

- Mức độ: High
- Vị trí:
  - `src/stores/useAuthStore.ts:49`
  - `src/stores/useAuthStore.ts:51`
  - `src/stores/useAuthStore.ts:111`
  - `src/stores/useAuthStore.ts:198`
  - `src/stores/useAuthStore.ts:212`
  - `src/services/storage/secureStorage.ts:16`
  - `src/services/storage/secureStorage.ts:27`
  - `src/utils/encryption.ts:21`
  - `src/utils/encryption.ts:36`
  - `src/utils/encryption.ts:64`
  - `src/utils/encryption.ts:72`
- Bằng chứng:
  - Store auth persist `managementKey` khi `rememberPassword` bật.
  - `secureStorage` ghi giá trị vào `localStorage`.
  - `encryptData()` dùng XOR với key suy ra từ `SECRET_SALT | host | userAgent`, tức toàn bộ đầu vào để giải mã đều có sẵn ở phía client.
  - Khi mã hóa lỗi, code fail-open và trả plaintext.
- Tác động:
  - Chỉ cần có XSS cùng origin, extension độc hại, hoặc truy cập cục bộ vào browser profile là attacker có thể lấy được management key và chiếm toàn quyền Management API.
  - Vì đây là admin bearer token, hậu quả là takeover toàn bộ proxy panel: đọc/sửa config, xoay key, thêm/xóa tài khoản OAuth, xem usage/quota.
- Khuyến nghị:
  - Không persist `managementKey` trong `localStorage` nữa; mặc định giữ trong memory và chỉ cho “remember” bằng cơ chế rõ ràng hơn.
  - Nếu buộc phải nhớ phiên, chuyển sang session ngắn hạn do backend cấp thay vì giữ admin key thô ở browser.
  - Không quảng bá XOR/base64 là “secure storage”; nếu vẫn giữ lại, chỉ nên coi đó là obfuscation và phải đổi UX/label tương ứng.
  - Bỏ nhánh fail-open trả plaintext ở `encryptData()`.
- Ghi chú:
  - Đây là finding quan trọng nhất trong repo hiện tại.

## Medium

### F-002: Bản deploy hiện không có CSP và không có chống clickjacking ở mức runtime/edge

- Mức độ: Medium
- Vị trí:
  - `index.html:1`
  - `index.html:11`
  - `wrangler.toml:1`
  - `vite.config.ts:40`
  - `vite.config.ts:42`
  - `vite.config.ts:68`
  - `vite.config.ts:73`
- Bằng chứng:
  - `index.html` không khai báo CSP meta.
  - Repo không có cấu hình header cho Cloudflare Pages trong `wrangler.toml` hay file `_headers`.
  - Build dùng `vite-plugin-singlefile`, inline JS/CSS vào một file HTML lớn, làm việc áp CSP nghiêm ngặt khó hơn.
  - Runtime response của `https://gptcli.pages.dev/` hiện thiếu các header:
    - `content-security-policy`
    - `x-frame-options`
    - `permissions-policy`
    - `cross-origin-opener-policy`
    - `cross-origin-resource-policy`
- Tác động:
  - Nếu tương lai có XSS ở bất kỳ điểm nào, không có CSP để giảm blast radius.
  - Admin panel có thể bị iframe/clickjacking vì không có `frame-ancestors` hoặc `X-Frame-Options`.
  - Với finding F-001, việc thiếu CSP/chống clickjacking làm hậu quả nặng hơn đáng kể.
- Khuyến nghị:
  - Thêm `_headers` cho Cloudflare Pages hoặc cấu hình edge tương đương.
  - Tối thiểu:
    - `Content-Security-Policy`
    - `X-Frame-Options: DENY` hoặc `frame-ancestors 'none'`
    - `Permissions-Policy`
    - `Cross-Origin-Opener-Policy: same-origin`
    - `Cross-Origin-Resource-Policy: same-origin`
  - Cân nhắc bỏ single-file build hoặc tự động hash script inline để áp CSP chặt hơn.
- Ghi chú:
  - Hiện runtime vẫn có mặt tích cực là `referrer-policy: strict-origin-when-cross-origin` và `x-content-type-options: nosniff`.

### F-003: UI sẵn sàng gửi management bearer token tới bất kỳ `API base` nào người dùng nhập, nhưng không có bước xác nhận trust boundary

- Mức độ: Medium
- Vị trí:
  - `src/pages/LoginPage.tsx:148`
  - `src/pages/LoginPage.tsx:154`
  - `src/pages/LoginPage.tsx:158`
  - `src/utils/connection.ts:3`
  - `src/utils/connection.ts:14`
  - `src/services/api/client.ts:34`
  - `src/services/api/client.ts:143`
- Bằng chứng:
  - `handleSubmit()` lấy `apiBase` do người dùng nhập rồi gọi `login(...)`.
  - `apiClient.setConfig()` nhận base mới và mọi request sau đó tự động thêm `Authorization: Bearer <managementKey>`.
  - Không có allowlist host, pinning, hay modal xác nhận riêng khi origin khác origin hiện tại.
- Tác động:
  - Chỉ cần nhập nhầm host, copy/paste nhầm backend, hoặc bị social engineering sang một backend giả là management key sẽ bị gửi thẳng tới server đó.
  - Vì app có chế độ deploy frontend riêng khỏi backend, rủi ro “nhập nhầm API base” là tình huống thực tế chứ không chỉ giả định.
- Khuyến nghị:
  - Khi `apiBase` origin khác `window.location.origin`, hiển thị cảnh báo rõ ràng và yêu cầu xác nhận thêm.
  - Hiển thị riêng hostname/port đích trước khi gửi key.
  - Cân nhắc allowlist host tin cậy hoặc pin “known backend origins”.
  - Tách “remember server” khỏi “remember management key”.
- Ghi chú:
  - Đây là hardening mang tính UX-security; không phải remote exploit thuần túy, nhưng rất đáng làm cho panel admin.

## Low / Quan sát thêm

### O-001: OAuth open-link chưa tự validate scheme/origin trước khi `window.open`

- Vị trí:
  - `src/pages/OAuthPage.tsx:391`
  - `src/pages/OAuthPage.tsx:402`
- Nhận xét:
  - `window.open(state.url, '_blank', 'noopener,noreferrer')` đã có `noopener,noreferrer`, đây là điểm tốt.
  - Tuy vậy, app vẫn đang tin hoàn toàn `state.url` từ backend.
  - Nên chặn các scheme lạ và chỉ cho phép `https:` (hoặc danh sách provider known hosts) trước khi mở.

## Điểm tốt

- Không thấy `dangerouslySetInnerHTML`, `eval`, `new Function`, `document.write`, `insertAdjacentHTML` trong luồng UI chính của app.
- Link ngoài ở trang hệ thống đã có `rel="noopener noreferrer"`.
- Runtime production dependency audit sạch:
  - `npm audit --omit=dev` => `0` vulnerability.
- Có kiểm tra response HTML giả ở tầng API client, tránh “đăng nhập giả thành công” khi frontend trỏ nhầm vào site tĩnh.

## Rủi ro ngoài phạm vi cần xác minh thêm

- Backend thật (`cli-proxy-api.exe`) không có source trong repo, nên các phần sau chưa được audit đầy đủ:
  - xác thực/tính mạnh của management key ở server
  - CORS policy của Management API
  - rate limiting / brute-force protection
  - OAuth callback validation phía server
  - logging có rò secret hay không

## Kết luận

Web này **chưa thể gọi là “bảo mật tốt” cho môi trường production admin panel** nếu giữ nguyên cách persist management key như hiện tại và chưa bổ sung CSP/chống clickjacking. Tuy nhiên nền code React của UI khá sạch ở lớp XSS trực tiếp, nên sau khi xử lý 3 điểm trên, đặc biệt là F-001 và F-002, posture bảo mật sẽ cải thiện rất rõ.
