# CDK JSON 兑换系统

一个可部署到 Vercel 的 CDK 兑换网站。后台导入 JSON 文件并生成 CDK，用户在 `/activate` 输入 CDK 后下载对应 JSON。

## 功能

- `/activate` 用户兑换页
- `/admin/login` 管理员登录
- `/admin` 管理后台
- 后台批量导入 `.json`
- 生成 CDK，设置发放数量、使用次数、过期时间
- 兑换时自动锁定库存，避免重复发放
- Neon Postgres 保存库存、CDK、兑换记录
- JSON 内容直接存 Neon `jsonb`，第一版无需对象存储

## 环境变量

在 Vercel 项目设置里添加：

```env
DATABASE_URL="postgresql://user:password@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="replace-with-a-long-random-secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-this-password"
NEXT_PUBLIC_SITE_NAME="CDK JSON 兑换"
```

`DATABASE_URL` 建议使用 Neon pooled connection string，也就是 host 里带 `-pooler` 的连接串。

## Neon 数据库

应用第一次访问 API 时会自动创建表。也可以在 Neon SQL Editor 手动执行：

```sql
\i sql/schema.sql
```

如果 Neon SQL Editor 不支持 `\i`，直接复制 `sql/schema.sql` 内容执行即可。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

访问：

- 用户兑换页：http://localhost:3000/activate
- 后台登录：http://localhost:3000/admin/login

## Vercel 部署

1. 把仓库导入 Vercel。
2. Framework Preset 选择 `Next.js`。
3. 添加上面的环境变量。
4. 部署完成后访问 `/admin/login`。
5. 登录后台，先导入 JSON，再生成 CDK。

## 数据流

```text
后台导入 JSON
  -> json_files.status = available
后台生成 CDK
  -> cdk_codes.status = active
用户兑换 CDK
  -> 锁定 CDK 和库存
  -> JSON 标记 delivered
  -> CDK 更新 used_count
  -> 写入 redeem_records
  -> 前台下载 JSON
```

## 注意

- 这个版本适合中小 JSON 文件。如果 JSON 很大或数量非常多，后续应改为 Neon 存元数据、Vercel Blob/R2 存文件。
- 不要把 `ADMIN_PASSWORD` 和 `JWT_SECRET` 提交进 GitHub。
- CDK 兑换接口已使用数据库锁和 `skip locked`，库存不会重复发放。
