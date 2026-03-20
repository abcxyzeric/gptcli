# ClipProxy Web Portal

Web này bọc ngoài `CLIProxyAPI` theo mô hình web app hoàn chỉnh:

- người dùng đăng nhập bằng tài khoản web riêng
- backend web giữ `CLI_PROXY_MANAGEMENT_KEY` ở phía server
- toàn bộ request quản trị `/v0/management/*` được proxy nội bộ sang `CLIProxyAPI`
- hỗ trợ đăng ký email/mật khẩu
- hỗ trợ đăng nhập OAuth Google và Discord

Frontend vẫn giữ lại phần lớn logic quản trị gốc của panel `CLIProxyAPI`, nhưng luồng đăng nhập đã được bóc tách thành lớp web auth riêng.

## Kiến trúc

1. `src/`
   React/Vite frontend cho dashboard và các màn quản trị.

2. `functions/api/auth/*`
   Cloudflare Pages Functions cho:
   - đăng ký
   - đăng nhập
   - đăng xuất
   - session hiện tại
   - OAuth Google / Discord

3. `functions/v0/management/[[path]].ts`
   Proxy bảo vệ cho Management API. Frontend gọi cùng origin, còn function sẽ gắn `CLI_PROXY_MANAGEMENT_KEY` rồi chuyển tiếp sang backend thật.

4. `migrations/0001_auth.sql`
   Schema D1 cho users, identities, sessions.

## Biến môi trường cần có

Tạo `.dev.vars` khi chạy local, hoặc set secrets trên Cloudflare Pages:

```env
APP_URL=https://your-domain.example
CLI_PROXY_API_BASE=https://your-real-cli-proxy-api.example
CLI_PROXY_MANAGEMENT_KEY=your-management-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
```

Khi chạy local, có thể copy từ:

```bash
cp .dev.vars.example .dev.vars
```

## D1 cần cấu hình

Trong `wrangler.toml` hiện có binding:

- `DB`
- `database_name = "clipproxy-web-auth"`

Bạn cần thay:

- `database_id`
- `preview_database_id`

bằng ID D1 thật của bạn trước khi deploy.

## Chạy local

1. Cài dependencies

```bash
npm ci
```

2. Chạy migration local cho D1

```bash
npm run db:migrate:local
```

3. Build frontend

```bash
npm run build
```

4. Chạy Pages Functions local

```bash
npm run dev:pages
```

5. Chạy `CLIProxyAPI` backend thật ở URL mà `CLI_PROXY_API_BASE` trỏ tới.

Ví dụ local:

```bash
cli-proxy-api.exe -config ./your-config.yaml
```

## Deploy Cloudflare Pages

1. Tạo D1 database.
2. Gắn D1 vào `wrangler.toml`.
3. Thêm secrets:
   - `APP_URL`
   - `CLI_PROXY_API_BASE`
   - `CLI_PROXY_MANAGEMENT_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
4. Deploy Pages như bình thường.

## Ghi chú quan trọng

- Nếu chưa set `CLI_PROXY_API_BASE` và `CLI_PROXY_MANAGEMENT_KEY`, user vẫn có thể đăng nhập web nhưng panel quản trị sẽ không gọi được backend thật.
- Google / Discord OAuth cần cấu hình callback URL theo domain deploy:
  - `https://your-domain.example/api/auth/oauth/google/callback`
  - `https://your-domain.example/api/auth/oauth/discord/callback`
- File `src/i18n/locales/vi.json` đã được làm sạch lại để tránh lỗi text tiếng Việt bị vỡ mã hóa.
