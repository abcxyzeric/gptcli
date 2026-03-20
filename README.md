# ClipProxy Web Portal

Đây là bản web Cloudflare-native của ClipProxy:

- frontend React/Vite chạy trên Cloudflare Pages
- backend chạy bằng Cloudflare Pages Functions
- dữ liệu người dùng lưu trong Cloudflare D1
- file xác thực và config nhạy cảm được mã hóa server-side bằng `DATA_ENCRYPTION_SECRET`
- đăng nhập bằng email/mật khẩu hoặc OAuth Google / Discord

Kiến trúc này không còn phụ thuộc vào `CLIProxyAPI` chạy riêng trên máy bạn. Mục tiêu là đưa phần backend cần thiết lên Cloudflare để web chạy độc lập, không cần VPS và cũng không cần máy cá nhân phải bật 24/7.

## Kiến trúc

1. `src/`
   Frontend React/Vite cho dashboard, access keys, tài khoản, quota, usage, provider và config.

2. `functions/api/auth/*`
   Backend auth trên Cloudflare:
   - đăng ký
   - đăng nhập
   - đăng xuất
   - session hiện tại
   - OAuth Google / Discord

3. `functions/v0/management/[[path]].ts`
   Backend management tương thích với panel gốc:
   - config JSON / YAML
   - access keys
   - auth files
   - usage import / export
   - model alias / excluded models
   - request logs giả lập tối thiểu
   - iFlow auth import
   - server-side `api-call`

4. `functions/_lib/portal.ts`
   Lớp core cho dữ liệu portal:
   - mã hóa AES-GCM bằng `DATA_ENCRYPTION_SECRET`
   - lưu state theo từng user trong D1
   - lưu auth file theo từng user trong D1
   - dựng model list và usage data

5. `migrations/0001_auth.sql`
   Schema D1 cho user, identity, session.

6. `migrations/0002_cloudflare_portal.sql`
   Schema D1 cho state portal và auth files.

## Biến môi trường

Tạo `.dev.vars` khi chạy local hoặc set secret trên Cloudflare Pages:

```env
APP_URL=https://your-domain.example
DATA_ENCRYPTION_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
```

Gợi ý cho `DATA_ENCRYPTION_SECRET`:
- dùng chuỗi ngẫu nhiên dài ít nhất 32 ký tự
- không commit vào git
- nếu đổi secret này sau khi đã có dữ liệu, dữ liệu cũ đã mã hóa sẽ không giải mã được nữa

## Cấu hình D1

Trong `wrangler.toml` hiện có binding:

- `DB`
- `database_name = "clipproxy-web-auth"`

Bạn cần thay `database_id` và `preview_database_id` bằng ID D1 thật của bạn nếu tạo project mới.

## Chạy local

1. Cài dependencies

```bash
npm ci
```

2. Copy biến môi trường mẫu

```bash
cp .dev.vars.example .dev.vars
```

3. Chạy migration local

```bash
npm run db:migrate:local
```

4. Build frontend

```bash
npm run build
```

5. Chạy Pages Functions local

```bash
npm run dev:pages
```

## Deploy Cloudflare

1. Tạo project Pages.
2. Tạo D1 database và gắn vào `wrangler.toml`.
3. Chạy migration remote:

```bash
npm run db:migrate:remote
```

4. Set secrets:
   - `APP_URL`
   - `DATA_ENCRYPTION_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`

5. Deploy production:

```bash
npm run build
npm run deploy:cloudflare
```

Script deploy hiện mặc định đẩy lên branch production `master`.

## Ghi chú bảo mật

- Session người dùng được giữ bằng cookie `HttpOnly`, không nhét token auth vào `localStorage`.
- Config, access keys và auth files nhạy cảm được mã hóa ở server trước khi lưu D1.
- Người dùng khác không thể tự đọc key của nhau chỉ vì biết domain; họ phải vượt qua lớp xác thực và phân quyền trước.
- Chủ tài khoản Cloudflare của project vẫn là người nắm toàn quyền vận hành. Nếu ai đó chiếm được Cloudflare account hoặc secret `DATA_ENCRYPTION_SECRET` thì dữ liệu có thể bị giải mã.
- Google / Discord OAuth cần cấu hình callback URL đúng với domain deploy:
  - `https://your-domain.example/api/auth/oauth/google/callback`
  - `https://your-domain.example/api/auth/oauth/discord/callback`
