# ClipProxy Web Console

Web panel cho `CLIProxyAPI`, giữ nguyên logic proxy gốc và chỉ bọc thêm giao diện để quản lý qua trình duyệt.

Project này trong workspace hiện tại gồm:

- `cli-proxy-api.exe`: binary backend gốc.
- `config.example.yaml`: cấu hình mẫu cho backend.
- `src/`: web UI React/Vite đã custom lại theo hướng dashboard proxy.
- `dist/index.html`: bản build tĩnh để deploy lên Cloudflare Pages hoặc host riêng.

## Mục tiêu

Web này tập trung vào đúng các nhu cầu bạn nêu:

- Quản lý `Access Keys` cho người dùng/CLI bên thứ ba.
- Danh sách tài khoản OAuth / auth files của bạn.
- Theo dõi quota còn lại, lượt còn lại, reset window.
- Xem usage/token/request.
- Không đụng vào logic proxy lõi của `CLIProxyAPI`.

## Tính năng chính

- `Dashboard`: tổng quan kết nối, số key, số account, điều hướng nhanh.
- `Access Keys`: tạo, sửa, xoay vòng, xóa key client mà không phải mở YAML.
- `Auth Files`: danh sách tài khoản, upload JSON, bật/tắt, xem models.
- `Quota`: theo dõi Claude, Codex, Gemini CLI, Kimi, Antigravity.
- `Usage`: biểu đồ requests/tokens/cost.
- `Providers + Config`: vẫn giữ toàn bộ màn hình quản trị upstream khi cần chỉnh sâu.

## Chạy local

1. Cài dependencies

```bash
npm ci
```

2. Chạy web dev

```bash
npm run dev
```

3. Build production

```bash
npm run build
```

4. Preview local

```bash
npm run preview
```

## Cách nối với backend

Web UI này nói chuyện với `CLIProxyAPI Management API`, vì vậy backend cần bật management key.

Ví dụ trong `config.yaml`:

```yaml
remote-management:
  allow-remote: true
  secret-key: "your-management-key"

usage-statistics-enabled: true
logging-to-file: true
```

Ghi chú:

- Nếu deploy web khác origin với backend, backend phải cho phép truy cập remote management.
- `usage-statistics-enabled: true` thì trang Usage mới có dữ liệu.
- `logging-to-file: true` thì trang Logs mới có log.

## Deploy GitHub

Repo đã có sẵn workflow build release từ upstream:

- `.github/workflows/release.yml`

Workflow này build ra `dist/index.html`, đổi tên thành `management.html`, rồi attach vào GitHub Release.

Nó hợp với trường hợp bạn muốn:

- Tag release trên GitHub.
- Để `CLIProxyAPI` tự tải web panel từ release về.

## Deploy Cloudflare Pages

Đã thêm sẵn:

- `wrangler.toml`
- `.github/workflows/deploy-cloudflare-pages.yml`
- script `npm run deploy:cloudflare`

### Cách deploy thủ công

```bash
npm run build
npm run deploy:cloudflare
```

### Cách deploy bằng GitHub Actions

Tạo 2 secret trong repo GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Sau đó push lên nhánh `main` hoặc `master`, workflow `Deploy To Cloudflare Pages` sẽ tự chạy.

Lưu ý:

- Workflow đang mặc định project name là `clipproxy-web-console`.
- Nếu bạn muốn đổi tên project Pages, sửa cả `wrangler.toml`, script trong `package.json` và workflow Cloudflare.

## Đẩy lên GitHub

Repo hiện đã ở trạng thái sẵn để init/push. Luồng cơ bản:

```bash
git add .
git commit -m "Build ClipProxy web console"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Tài liệu gốc đã giữ lại

Tài liệu upstream ban đầu của backend được giữ tại:

- `CLI_PROXY_API_UPSTREAM_README.md`
- `CLI_PROXY_API_UPSTREAM_README_CN.md`

## Ghi chú

- Đây là web UI wrapper, không thay backend gốc.
- Nếu bạn muốn bước tiếp theo là biến nó thành web public nhiều user có auth/login riêng, cần thêm backend tầng người dùng ở phía trước `CLIProxyAPI`.
